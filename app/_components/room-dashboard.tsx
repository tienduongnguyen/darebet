"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { getTeamFlag } from "@/lib/domain/country-flags";
import { calculateOddsPercentages, formatPercentage } from "@/lib/domain/odds";
import { useGuestIdentity } from "@/lib/hooks/use-guest-identity";
import {
  useRoomRealtime,
  type RealtimeConnectionStatus,
} from "@/lib/hooks/use-room-realtime";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/messages";
import { copyTextToClipboard } from "@/lib/utils/clipboard";
import { sanitizeText } from "@/lib/validation/common";

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

const VOTING_LOCK_BEFORE_KICKOFF_MS = 10 * 60 * 1000;

interface RoomMembersPayload {
  room: {
    id: string;
    room_name: string;
    created_by: string;
    created_at: string;
  };
  members: Array<{
    id: number;
    room_id: string;
    guest_id: string;
    display_name: string;
    joined_at: string;
  }>;
}

interface LeaderboardPayload {
  leaderboard: Array<{
    guest_id: string;
    display_name: string;
    points: number;
    wins: number;
    losses: number;
    pending: number;
  }>;
}

interface MatchFeedPayload {
  matches: Array<{
    id: string;
    home_team: string;
    away_team: string;
    commence_time: string;
    home_odds: number | null;
    away_odds: number | null;
    draw_odds: number | null;
    status: "uncommenced" | "live" | "completed";
  }>;
}

type VotePick = "home" | "away";

interface RoomChallengesPayload {
  challenges: Array<{
    id: string;
    room_id: string;
    match_id: string;
    created_by: string;
    punishment: string;
    voting_deadline: string;
    status: "voting" | "home_won" | "away_won" | "draw";
    created_at: string;
    created_by_name: string | null;
    match: {
      id: string;
      home_team: string;
      away_team: string;
      commence_time: string;
      status: "uncommenced" | "live" | "completed";
      home_score: number | null;
      away_score: number | null;
    } | null;
    votes: Array<{
      guest_id: string;
      display_name: string | null;
      pick: VotePick;
      punishment_done: boolean;
      voted_at: string;
    }>;
  }>;
}

type RoomChallenge = RoomChallengesPayload["challenges"][number];

interface ApiErrorPayload {
  error?: string;
  code?: string;
}

interface RoomDashboardProps {
  roomId: string;
}

const badgeClassByMatchStatus: Record<string, string> = {
  uncommenced: "badge-ghost",
  live: "badge-error",
  completed: "badge-neutral",
};

const realtimeStatusPresentation: Record<
  RealtimeConnectionStatus,
  { labelKey: MessageKey; badgeClass: string; pulse: boolean }
> = {
  idle: { labelKey: "rt.connecting", badgeClass: "badge-ghost", pulse: false },
  connecting: { labelKey: "rt.connecting", badgeClass: "badge-ghost", pulse: true },
  live: { labelKey: "rt.live", badgeClass: "badge-success", pulse: true },
  reconnecting: {
    labelKey: "rt.reconnecting",
    badgeClass: "badge-warning",
    pulse: true,
  },
  polling: { labelKey: "rt.polling", badgeClass: "badge-info", pulse: false },
  offline: { labelKey: "rt.offline", badgeClass: "badge-error", pulse: false },
};

const formatTimeLeft = (
  deadlineIso: string,
  nowMs: number,
  t: Translate,
): string => {
  const diffMs = new Date(deadlineIso).getTime() - nowMs;

  if (diffMs <= 0) {
    return t("time.closed");
  }

  const totalMinutes = Math.ceil(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return t("time.daysHours", { days, hours });
  }

  if (hours > 0) {
    return t("time.hoursMinutes", { hours, minutes });
  }

  return t("time.minutes", { minutes });
};

const readApiErrorMessage = async (
  response: Response,
  t: Translate,
): Promise<string> => {
  try {
    const payload = (await response.json()) as ApiErrorPayload;

    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    return t("common.serverError");
  }

  return t("common.serverError");
};

export function RoomDashboard({ roomId }: RoomDashboardProps) {
  const { t, formatDateTime } = useI18n();
  const { profile, isBootstrapping } = useGuestIdentity();
  const [membersData, setMembersData] = useState<RoomMembersPayload | null>(null);
  const [matches, setMatches] = useState<MatchFeedPayload["matches"]>([]);
  const [challenges, setChallenges] = useState<
    RoomChallengesPayload["challenges"]
  >([]);
  const [leaderboard, setLeaderboard] = useState<
    LeaderboardPayload["leaderboard"]
  >([]);

  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [punishmentInput, setPunishmentInput] = useState("");

  const [composerError, setComposerError] = useState("");
  const [composerSuccess, setComposerSuccess] = useState("");
  const [isSubmittingChallenge, setIsSubmittingChallenge] = useState(false);
  const [activeVoteActionId, setActiveVoteActionId] = useState("");
  const [activePunishmentDoneId, setActivePunishmentDoneId] = useState("");
  const [isRoomIdCopied, setIsRoomIdCopied] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const guestId = profile?.guest_id;
  const isHost = Boolean(
    guestId && membersData && membersData.room.created_by === guestId,
  );

  const selectedMatch = matches.find((match) => match.id === selectedMatchId);

  const challengeByMatchId = new Map<string, RoomChallenge>();

  for (const challenge of challenges) {
    challengeByMatchId.set(challenge.match_id, challenge);
  }

  const isMatchVotingLocked = (
    match: MatchFeedPayload["matches"][number],
  ): boolean =>
    match.status !== "uncommenced" ||
    nowMs >=
      new Date(match.commence_time).getTime() - VOTING_LOCK_BEFORE_KICKOFF_MS;

  const fetchMembers = useCallback(
    async (options?: { silent?: boolean; sync?: boolean }) => {
    const silent = options?.silent ?? false;

    if (!guestId) {
      return;
    }

    if (!silent) {
      setIsLoading(true);
      setErrorMessage("");
    }

    // User-initiated refresh pulls fresh odds/results from the Odds API first
    // (server-side throttled). Realtime reconciles stay read-only.
    if (options?.sync) {
      try {
        await fetch("/api/sync", { method: "POST" });
      } catch {
        // Non-fatal: fall through and render whatever the cache holds.
      }
    }

    try {
      const roomPath = `/api/rooms/${encodeURIComponent(roomId)}`;
      const guestQuery = `guestId=${encodeURIComponent(guestId)}`;

      const [membersResponse, challengesResponse, matchesResponse, leaderboardResponse] =
        await Promise.all([
          fetch(`${roomPath}/members?${guestQuery}`, {
            method: "GET",
            cache: "no-store",
          }),
          fetch(`${roomPath}/challenges?${guestQuery}`, {
            method: "GET",
            cache: "no-store",
          }),
          fetch("/api/matches", {
            method: "GET",
            cache: "no-store",
          }),
          fetch(`${roomPath}/leaderboard?${guestQuery}`, {
            method: "GET",
            cache: "no-store",
          }),
        ]);

      const failedResponse = [
        membersResponse,
        challengesResponse,
        matchesResponse,
        leaderboardResponse,
      ].find((response) => !response.ok);

      if (failedResponse) {
        // Keep the last good state on silent realtime reconciles instead of
        // flashing an error over live data.
        if (silent) {
          return;
        }
        setMembersData(null);
        setChallenges([]);
        setMatches([]);
        setLeaderboard([]);
        setErrorMessage(await readApiErrorMessage(failedResponse, t));
        return;
      }

      const [membersPayload, challengesPayload, matchesPayload, leaderboardPayload] =
        await Promise.all([
          membersResponse.json() as Promise<RoomMembersPayload>,
          challengesResponse.json() as Promise<RoomChallengesPayload>,
          matchesResponse.json() as Promise<MatchFeedPayload>,
          leaderboardResponse.json() as Promise<LeaderboardPayload>,
        ]);

      setMembersData(membersPayload);
      setChallenges(challengesPayload.challenges);
      setMatches(matchesPayload.matches);
      setLeaderboard(leaderboardPayload.leaderboard);
      setNowMs(Date.now());
    } catch {
      if (silent) {
        return;
      }
      setMembersData(null);
      setChallenges([]);
      setMatches([]);
      setLeaderboard([]);
      setErrorMessage(t("room.errLoad"));
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
    },
    [guestId, roomId, t],
  );

  const { status: realtimeStatus } = useRoomRealtime({
    roomId,
    guestId,
    onReconcile: useCallback(() => {
      void fetchMembers({ silent: true });
    }, [fetchMembers]),
  });

  const realtime = realtimeStatusPresentation[realtimeStatus];
  const isRealtimeDegraded =
    realtimeStatus === "reconnecting" || realtimeStatus === "offline";

  useEffect(() => {
    if (!guestId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchMembers({ sync: true });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchMembers, guestId]);

  const handleCopyRoomId = async () => {
    const copied = await copyTextToClipboard(roomId);

    if (!copied) {
      setErrorMessage(t("room.errCopy"));
      return;
    }

    setIsRoomIdCopied(true);
    window.setTimeout(() => setIsRoomIdCopied(false), 2000);
  };

  const handleSelectMatch = (match: MatchFeedPayload["matches"][number]) => {
    if (isMatchVotingLocked(match) || challengeByMatchId.has(match.id)) {
      return;
    }

    setComposerError("");
    setComposerSuccess("");
    setSelectedMatchId((current) => (current === match.id ? "" : match.id));
  };

  const handleCreateChallenge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!guestId) {
      setComposerError(t("common.identityNotReady"));
      return;
    }

    const normalizedPunishment = sanitizeText(punishmentInput);

    if (!selectedMatchId) {
      setComposerError(t("room.composer.errSelect"));
      return;
    }

    if (normalizedPunishment.length < 3 || normalizedPunishment.length > 220) {
      setComposerError(t("room.composer.errPunish"));
      return;
    }

    setComposerError("");
    setComposerSuccess("");
    setIsSubmittingChallenge(true);

    try {
      const response = await fetch(
        `/api/rooms/${encodeURIComponent(roomId)}/challenges`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            guestId,
            matchId: selectedMatchId,
            punishment: normalizedPunishment,
          }),
        },
      );

      if (!response.ok) {
        setComposerError(await readApiErrorMessage(response, t));
        return;
      }

      setPunishmentInput("");
      setSelectedMatchId("");
      setComposerSuccess(t("room.composer.success"));
      await fetchMembers();
    } catch {
      setComposerError(t("room.composer.errCreate"));
    } finally {
      setIsSubmittingChallenge(false);
    }
  };

  const handleVote = async (challengeId: string, pick: VotePick) => {
    if (!guestId) {
      setErrorMessage(t("common.identityNotReady"));
      return;
    }

    const actionId = `${challengeId}:${pick}`;
    setActiveVoteActionId(actionId);

    try {
      const response = await fetch(
        `/api/rooms/${encodeURIComponent(roomId)}/challenges/${encodeURIComponent(challengeId)}/vote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            guestId,
            pick,
          }),
        },
      );

      if (!response.ok) {
        setErrorMessage(await readApiErrorMessage(response, t));
        return;
      }

      await fetchMembers();
    } catch {
      setErrorMessage(t("room.ch.errVote"));
    } finally {
      setActiveVoteActionId("");
    }
  };

  const handlePunishmentDone = async (challengeId: string) => {
    if (!guestId) {
      setErrorMessage(t("common.identityNotReady"));
      return;
    }

    setActivePunishmentDoneId(challengeId);

    try {
      const response = await fetch(
        `/api/rooms/${encodeURIComponent(roomId)}/challenges/${encodeURIComponent(challengeId)}/completion`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            guestId,
          }),
        },
      );

      if (!response.ok) {
        setErrorMessage(await readApiErrorMessage(response, t));
        return;
      }

      await fetchMembers();
    } catch {
      setErrorMessage(t("room.ch.errCompletion"));
    } finally {
      setActivePunishmentDoneId("");
    }
  };

  return (
    <div className="relative min-h-screen">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
        <Link
          href="/"
          className="btn btn-ghost btn-sm w-fit gap-1 self-start"
        >
          <span aria-hidden>←</span>
          {t("common.back")}
        </Link>

        <section className="hero relative overflow-hidden rounded-box border border-base-content/5 bg-base-100 shadow-xl animate-rise">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-accent to-secondary"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-12 select-none text-[9rem] leading-none opacity-[0.06] animate-float md:-right-4 md:text-[12rem]"
          >
            ⚽
          </div>
          <div className="hero-content w-full flex-col items-start gap-3 px-5 py-8 text-left md:px-8">
            <span className="badge badge-soft badge-primary badge-sm md:badge-md">
              {t("room.badge")}
            </span>
            <h1 className="font-display text-4xl font-extrabold uppercase leading-none tracking-tight md:text-6xl">
              {membersData?.room.room_name ?? t("room.fallbackName")}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/70">
              <span>
                {t("room.roomIdLabel")}{" "}
                <span className="font-mono">{roomId}</span>
              </span>
              <button
                type="button"
                onClick={() => void handleCopyRoomId()}
                className={`btn btn-xs shrink-0 whitespace-nowrap ${isRoomIdCopied ? "btn-success" : "btn-outline btn-primary"}`}
              >
                {isRoomIdCopied ? (
                  <span className="animate-pop">{t("common.copiedBang")}</span>
                ) : (
                  t("common.copyId")
                )}
              </button>
            </div>
          </div>
        </section>

        {isBootstrapping && (
          <section className="card card-border border-base-content/5 bg-base-100 shadow-md animate-rise stagger-1">
            <div className="card-body flex-row items-center gap-3">
              <span className="loading loading-spinner loading-md text-primary"></span>
              <p>{t("room.loadingIdentity")}</p>
            </div>
          </section>
        )}

        {!isBootstrapping && profile && (
          <section className="card card-border border-base-content/5 bg-base-100 shadow-md animate-rise stagger-1">
            <div className="card-body">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="card-title font-display text-2xl uppercase tracking-wide">
                    <span aria-hidden className="h-5 w-1 rounded-full bg-primary" />
                    {t("room.members.title")}
                  </h2>
                  <p className="text-sm text-base-content/70">
                    {t("room.members.connectedAs")}
                    <span className="font-medium text-base-content">
                      {profile.display_name || t("common.guest")}
                    </span>
                  </p>
                  <span
                    className={`badge badge-soft badge-sm mt-1 ${realtime.badgeClass}`}
                    title={t("rt.statusTitle")}
                  >
                    <span
                      aria-hidden
                      className={realtime.pulse ? "animate-pulse" : ""}
                    >
                      ●
                    </span>{" "}
                    {t(realtime.labelKey)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void fetchMembers({ sync: true })}
                  disabled={isLoading}
                  className="btn btn-outline btn-primary"
                >
                  {isLoading ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      {t("common.refreshing")}
                    </>
                  ) : (
                    t("common.refresh")
                  )}
                </button>
              </div>

              {isRealtimeDegraded ? (
                <div role="status" className="alert alert-warning alert-soft mt-4">
                  <span className="loading loading-spinner loading-sm"></span>
                  <span>{t("room.members.connLost")}</span>
                </div>
              ) : null}

              {errorMessage ? (
                <div role="alert" className="alert alert-error alert-soft alert-vertical mt-4 sm:alert-horizontal">
                  <span>{errorMessage}</span>
                  <Link href="/" className="btn btn-error btn-sm">
                    {t("room.members.backEntry")}
                  </Link>
                </div>
              ) : null}

              {!errorMessage && !isLoading && membersData && membersData.members.length === 0 ? (
                <p className="mt-4 text-sm text-base-content/70">
                  {t("room.members.empty")}
                </p>
              ) : null}

              {!errorMessage && membersData && membersData.members.length > 0 ? (
                <ul className="list mt-4 rounded-box bg-base-200">
                  {membersData.members.map((member) => (
                    <li
                      key={member.id}
                      className="list-row items-center transition-colors duration-200 hover:bg-base-300/50"
                    >
                      <div className="avatar avatar-placeholder">
                        <div
                          className={`w-10 rounded-full ${
                            member.guest_id === membersData.room.created_by
                              ? "bg-secondary/20 text-secondary ring-2 ring-secondary/40"
                              : "bg-neutral text-neutral-content"
                          }`}
                        >
                          <span className="text-sm font-semibold uppercase">
                            {member.display_name.slice(0, 2)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="font-medium">{member.display_name}</p>
                        <p className="text-sm text-base-content/60">
                          {t("common.joinedAt", {
                            date: formatDateTime(member.joined_at),
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {member.guest_id === membersData.room.created_by ? (
                          <span className="badge badge-soft badge-secondary badge-sm">
                            {t("common.host")}
                          </span>
                        ) : null}
                        {member.guest_id === profile.guest_id ? (
                          <span className="badge badge-soft badge-primary badge-sm">
                            {t("common.you")}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        )}

        {!isBootstrapping && profile && (
          <section className="card card-border border-base-content/5 bg-base-100 shadow-md animate-rise stagger-2">
            <div className="card-body">
              <h2 className="card-title font-display text-2xl uppercase tracking-wide">
                <span aria-hidden className="h-5 w-1 rounded-full bg-secondary" />
                {t("room.lb.title")}
              </h2>
              <p className="text-sm text-base-content/70">
                {t("room.lb.desc")}
              </p>

              {leaderboard.length === 0 ? (
                <p className="mt-3 text-sm text-base-content/70">
                  {t("room.lb.empty")}
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-box bg-base-200">
                  <table className="table table-zebra">
                    <thead>
                      <tr>
                        <th>{t("room.lb.rank")}</th>
                        <th>{t("room.lb.player")}</th>
                        <th className="text-right">{t("room.lb.points")}</th>
                        <th className="text-right">{t("room.lb.wl")}</th>
                        <th className="text-right">{t("room.lb.pending")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((entry, index) => (
                        <tr
                          key={entry.guest_id}
                          className={`transition-colors duration-200 ${
                            index === 0
                              ? "bg-secondary/10 hover:bg-secondary/15"
                              : "hover:bg-base-300/40"
                          }`}
                        >
                          <th className={index < 3 ? "text-lg" : ""}>
                            {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1}
                          </th>
                          <td className="font-medium">{entry.display_name}</td>
                          <td className="text-right font-display text-lg font-bold text-primary">
                            {entry.points}
                          </td>
                          <td className="text-right">
                            <span className="text-success">
                              {t("room.lb.win", { n: entry.wins })}
                            </span>
                            {" / "}
                            <span className="text-error">
                              {t("room.lb.loss", { n: entry.losses })}
                            </span>
                          </td>
                          <td className="text-right">{entry.pending}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {!isBootstrapping && profile && (
          <section className="card card-border border-base-content/5 bg-base-100 shadow-md animate-rise stagger-3">
            <div className="card-body">
              <h2 className="card-title font-display text-2xl uppercase tracking-wide">
                <span aria-hidden className="h-5 w-1 rounded-full bg-accent" />
                {t("room.matches.title")}
              </h2>
              <p className="text-sm text-base-content/70">
                {isHost
                  ? t("room.matches.hintHost")
                  : t("room.matches.hintGuest")}
              </p>

              {matches.length === 0 ? (
                <p className="mt-3 text-sm text-base-content/70">
                  {t("room.matches.empty")}
                </p>
              ) : (
                <ul className="mt-3 flex max-h-[32rem] flex-col gap-3 overflow-y-auto pr-1">
                  {matches.map((match) => {
                    const percentages = calculateOddsPercentages(
                      match.home_odds,
                      match.draw_odds,
                      match.away_odds,
                    );
                    const hasChallenge = challengeByMatchId.has(match.id);
                    const isLocked = isMatchVotingLocked(match);
                    const isSelectable = !isLocked && !hasChallenge;
                    const isSelected = selectedMatchId === match.id;
                    const isDimmed = Boolean(selectedMatchId) && !isSelected;

                    return (
                      <li key={match.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectMatch(match)}
                          disabled={!isSelectable}
                          aria-pressed={isSelected}
                          className={`card card-border w-full text-left transition-all duration-300 ${
                            isSelected
                              ? "border-primary bg-primary/5 ring-2 ring-primary/40 shadow-md"
                              : "border-transparent bg-base-200"
                          } ${isDimmed ? "opacity-40 saturate-50" : ""} ${
                            isSelectable
                              ? "cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
                              : "cursor-not-allowed"
                          }`}
                        >
                          <div className="card-body gap-3 p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-base font-semibold">
                                  {getTeamFlag(match.home_team)} {match.home_team}{" "}
                                  <span className="font-normal text-base-content/60">vs</span>{" "}
                                  {match.away_team} {getTeamFlag(match.away_team)}
                                </p>
                                <p className="mt-1 text-sm text-base-content/60">
                                  {t("common.kickoff", {
                                    date: formatDateTime(match.commence_time),
                                  })}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-1">
                                {isSelected ? (
                                  <span className="badge badge-primary">
                                    {t("room.matches.selected")}
                                  </span>
                                ) : null}
                                {hasChallenge ? (
                                  <span className="badge badge-soft badge-accent">
                                    {t("room.matches.challengeCreated")}
                                  </span>
                                ) : null}
                                {isLocked && match.status === "uncommenced" ? (
                                  <span className="badge badge-soft badge-neutral">
                                    {t("room.matches.votingLocked")}
                                  </span>
                                ) : null}
                                <span
                                  className={`badge badge-soft uppercase ${badgeClassByMatchStatus[match.status] ?? "badge-ghost"} ${match.status === "live" ? "badge-live" : ""}`}
                                >
                                  {t(`status.${match.status}` as MessageKey)}
                                </span>
                              </div>
                            </div>

                            <div className="stats stats-vertical bg-base-100 sm:stats-horizontal">
                              <div className="stat px-4 py-2">
                                <div className="stat-title text-sm">
                                  {getTeamFlag(match.home_team)} {t("room.side.home")}
                                </div>
                                <div className="stat-value font-display text-xl text-primary">
                                  {formatPercentage(percentages.home)}
                                </div>
                                <div className="stat-desc text-sm">
                                  {t("room.stat.odds", { value: match.home_odds ?? "—" })}
                                </div>
                              </div>
                              <div className="stat px-4 py-2">
                                <div className="stat-title text-sm">
                                  {t("room.stat.draw")}
                                </div>
                                <div className="stat-value font-display text-xl">
                                  {formatPercentage(percentages.draw)}
                                </div>
                                <div className="stat-desc text-sm">
                                  {t("room.stat.odds", { value: match.draw_odds ?? "—" })}
                                </div>
                              </div>
                              <div className="stat px-4 py-2">
                                <div className="stat-title text-sm">
                                  {getTeamFlag(match.away_team)} {t("room.side.away")}
                                </div>
                                <div className="stat-value font-display text-xl text-secondary">
                                  {formatPercentage(percentages.away)}
                                </div>
                                <div className="stat-desc text-sm">
                                  {t("room.stat.odds", { value: match.away_odds ?? "—" })}
                                </div>
                              </div>
                            </div>

                            {percentages.home !== null ? (
                              <div
                                aria-hidden
                                className="flex h-1.5 w-full overflow-hidden rounded-full bg-base-300"
                              >
                                <div
                                  className="bg-primary transition-all duration-500"
                                  style={{ width: `${percentages.home}%` }}
                                />
                                <div
                                  className="bg-base-content/20 transition-all duration-500"
                                  style={{ width: `${percentages.draw ?? 0}%` }}
                                />
                                <div
                                  className="bg-secondary transition-all duration-500"
                                  style={{ width: `${percentages.away ?? 0}%` }}
                                />
                              </div>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        {!isBootstrapping && profile && isHost && (
          <section className="card card-border border-base-content/5 bg-base-100 shadow-md animate-rise stagger-4">
            <div className="card-body">
              <h2 className="card-title font-display text-2xl uppercase tracking-wide">
                <span aria-hidden className="h-5 w-1 rounded-full bg-warning" />
                {t("room.composer.title")}
              </h2>
              <p className="text-sm text-base-content/70">
                {t("room.composer.desc")}
              </p>

              {selectedMatch ? (
                <div className="alert alert-info alert-soft mt-2">
                  <span>
                    {t("room.composer.selectedPrefix")}
                    <span className="font-semibold">
                      {getTeamFlag(selectedMatch.home_team)} {selectedMatch.home_team}{" "}
                      {t("common.vs")} {selectedMatch.away_team}{" "}
                      {getTeamFlag(selectedMatch.away_team)}
                    </span>
                    {t("room.composer.selectedSuffix")}
                  </span>
                </div>
              ) : (
                <div className="alert alert-warning alert-soft mt-2">
                  <span>{t("room.composer.noMatch")}</span>
                </div>
              )}

              <form onSubmit={handleCreateChallenge}>
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">
                    {t("room.composer.punishLegend")}
                  </legend>
                  <textarea
                    className="textarea min-h-24 w-full"
                    value={punishmentInput}
                    onChange={(event) => setPunishmentInput(event.target.value)}
                    placeholder={t("room.composer.punishPlaceholder")}
                  />
                  <p className="label">{t("room.composer.punishHint")}</p>
                </fieldset>

                {composerError ? (
                  <div role="alert" className="alert alert-error alert-soft mt-2">
                    <span>{composerError}</span>
                  </div>
                ) : null}
                {composerSuccess ? (
                  <div role="alert" className="alert alert-success alert-soft mt-2">
                    <span>{composerSuccess}</span>
                  </div>
                ) : null}

                <div className="card-actions mt-4">
                  <button
                    type="submit"
                    disabled={isSubmittingChallenge || !selectedMatch}
                    className="btn btn-primary btn-block sm:btn-wide"
                  >
                    {isSubmittingChallenge ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        {t("room.composer.submitting")}
                      </>
                    ) : (
                      t("room.composer.submit")
                    )}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {!isBootstrapping && profile && (
          <section className="card card-border border-base-content/5 bg-base-100 shadow-md animate-rise stagger-5">
            <div className="card-body">
              <h2 className="card-title font-display text-2xl uppercase tracking-wide">
                <span aria-hidden className="h-5 w-1 rounded-full bg-error" />
                {t("room.ch.title")}
              </h2>
              <p className="text-sm text-base-content/70">
                {t("room.ch.desc")}
              </p>

              {challenges.length === 0 ? (
                <p className="mt-3 text-sm text-base-content/70">
                  {isHost
                    ? t("room.ch.emptyHost")
                    : t("room.ch.emptyGuest")}
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {challenges.map((challenge) => {
                    const match = challenge.match;
                    const homeVotes = challenge.votes.filter(
                      (vote) => vote.pick === "home",
                    );
                    const awayVotes = challenge.votes.filter(
                      (vote) => vote.pick === "away",
                    );
                    const totalVotes = challenge.votes.length;
                    const homeShare =
                      totalVotes > 0
                        ? Math.round((homeVotes.length / totalVotes) * 100)
                        : 50;
                    const myVote = challenge.votes.find(
                      (vote) => vote.guest_id === guestId,
                    );
                    const isVotingOpen =
                      challenge.status === "voting" &&
                      nowMs < new Date(challenge.voting_deadline).getTime();
                    const isAwaitingResult =
                      challenge.status === "voting" && !isVotingOpen;
                    const winningPick: VotePick | null =
                      challenge.status === "home_won"
                        ? "home"
                        : challenge.status === "away_won"
                          ? "away"
                          : null;
                    const winners = winningPick
                      ? challenge.votes.filter((vote) => vote.pick === winningPick)
                      : [];
                    const losers = winningPick
                      ? challenge.votes.filter((vote) => vote.pick !== winningPick)
                      : [];
                    const myLosingVote = losers.find(
                      (vote) => vote.guest_id === guestId,
                    );
                    const voterIds = new Set(
                      challenge.votes.map((vote) => vote.guest_id),
                    );
                    const nonVoters =
                      membersData?.members.filter(
                        (member) => !voterIds.has(member.guest_id),
                      ) ?? [];
                    const homeLabel = match
                      ? `${getTeamFlag(match.home_team)} ${match.home_team}`
                      : t("room.side.home");
                    const awayLabel = match
                      ? `${match.away_team} ${getTeamFlag(match.away_team)}`
                      : t("room.side.away");
                    const homeVoteActionId = `${challenge.id}:home`;
                    const awayVoteActionId = `${challenge.id}:away`;
                    const isVoting = activeVoteActionId.startsWith(`${challenge.id}:`);

                    return (
                      <li
                        key={challenge.id}
                        className={`card border-l-4 bg-base-200 transition-shadow duration-300 hover:shadow-lg ${
                          isVotingOpen
                            ? "border-warning"
                            : isAwaitingResult
                              ? "border-info"
                              : challenge.status === "draw"
                                ? "border-base-content/20"
                                : "border-success"
                        }`}
                      >
                        <div className="card-body gap-3 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-base font-semibold">
                                {match ? (
                                  <>
                                    {getTeamFlag(match.home_team)} {match.home_team}{" "}
                                    <span className="font-normal text-base-content/60">
                                      {t("common.vs")}
                                    </span>{" "}
                                    {match.away_team} {getTeamFlag(match.away_team)}
                                  </>
                                ) : (
                                  t("room.ch.matchUnavailable")
                                )}
                              </p>
                              {match ? (
                                <p className="mt-1 text-sm text-base-content/60">
                                  {t("common.kickoff", {
                                    date: formatDateTime(match.commence_time),
                                  })}
                                  {match.status === "completed" &&
                                  match.home_score !== null &&
                                  match.away_score !== null
                                    ? t("room.ch.finalScore", {
                                        home: match.home_score,
                                        away: match.away_score,
                                      })
                                    : ""}
                                </p>
                              ) : null}
                              <p className="mt-1 text-sm text-base-content/60">
                                {t("room.ch.startedBy", {
                                  name:
                                    challenge.created_by_name ??
                                    t("room.ch.hostFallback"),
                                  date: formatDateTime(challenge.created_at),
                                })}
                              </p>
                            </div>

                            {isVotingOpen ? (
                              <span className="badge badge-soft badge-warning">
                                <span aria-hidden className="animate-pulse">●</span>{" "}
                                {t("room.ch.votingOpen", {
                                  time: formatTimeLeft(
                                    challenge.voting_deadline,
                                    nowMs,
                                    t,
                                  ),
                                })}
                              </span>
                            ) : isAwaitingResult ? (
                              <span className="badge badge-soft badge-info">
                                {t("room.ch.votingClosed")}
                              </span>
                            ) : challenge.status === "draw" ? (
                              <span className="badge badge-soft badge-neutral">
                                {t("room.ch.drawTie")}
                              </span>
                            ) : (
                              <span className="badge badge-soft badge-success">
                                {t("room.ch.sideWon", {
                                  team:
                                    challenge.status === "home_won"
                                      ? homeLabel
                                      : awayLabel,
                                })}
                              </span>
                            )}
                          </div>

                          <div className="rounded-box border border-warning/20 bg-warning/5 p-3">
                            <p className="font-display text-xs font-bold uppercase tracking-widest text-warning">
                              {t("room.ch.theDare")}
                            </p>
                            <p className="mt-1 text-sm leading-relaxed">
                              {challenge.punishment}
                            </p>
                          </div>

                          <p className="text-sm text-base-content/60">
                            {t("room.ch.deadline", {
                              date: formatDateTime(challenge.voting_deadline),
                            })}
                          </p>

                          {isVotingOpen ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                disabled={isVoting || myVote?.pick === "home"}
                                onClick={() => void handleVote(challenge.id, "home")}
                                className={`btn transition-transform active:scale-95 ${myVote?.pick === "home" ? "btn-primary" : "btn-outline btn-primary"}`}
                              >
                                {activeVoteActionId === homeVoteActionId ? (
                                  <span className="loading loading-spinner loading-sm"></span>
                                ) : myVote?.pick === "home" ? (
                                  "✓ "
                                ) : null}
                                {homeLabel} • {homeVotes.length}
                              </button>

                              <button
                                type="button"
                                disabled={isVoting || myVote?.pick === "away"}
                                onClick={() => void handleVote(challenge.id, "away")}
                                className={`btn transition-transform active:scale-95 ${myVote?.pick === "away" ? "btn-secondary" : "btn-outline btn-secondary"}`}
                              >
                                {activeVoteActionId === awayVoteActionId ? (
                                  <span className="loading loading-spinner loading-sm"></span>
                                ) : myVote?.pick === "away" ? (
                                  "✓ "
                                ) : null}
                                {awayLabel} • {awayVotes.length}
                              </button>
                            </div>
                          ) : null}

                          {isVotingOpen && myVote ? (
                            <p className="text-sm text-base-content/60">
                              {t("room.ch.youVotedPrefix")}
                              <span className="font-medium">
                                {myVote.pick === "home" ? homeLabel : awayLabel}
                              </span>
                              {t("room.ch.youVotedSuffix")}
                            </p>
                          ) : null}

                          {totalVotes > 0 ? (
                            <div>
                              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-base-100">
                                <div
                                  className={`bg-primary transition-all duration-500 ${isVotingOpen ? "bar-stripes" : ""}`}
                                  style={{ width: `${homeShare}%` }}
                                ></div>
                                <div
                                  className={`bg-secondary transition-all duration-500 ${isVotingOpen ? "bar-stripes" : ""}`}
                                  style={{ width: `${100 - homeShare}%` }}
                                ></div>
                              </div>
                              <div className="mt-1 flex justify-between text-sm text-base-content/60">
                                <span className="text-primary">
                                  {homeLabel}: {homeVotes.length}
                                </span>
                                <span className="text-secondary">
                                  {awayLabel}: {awayVotes.length}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-base-content/60">
                              {t("room.ch.noVotes")}
                            </p>
                          )}

                          {totalVotes > 0 ? (
                            <div className="flex flex-wrap gap-1 text-xs">
                              {challenge.votes.map((vote) => (
                                <span
                                  key={vote.guest_id}
                                  className={`badge badge-soft badge-sm ${vote.pick === "home" ? "badge-primary" : "badge-secondary"}`}
                                >
                                  {vote.display_name ?? t("common.guest")} →{" "}
                                  {vote.pick === "home"
                                    ? t("room.side.home")
                                    : t("room.side.away")}
                                </span>
                              ))}
                              {nonVoters.length > 0 ? (
                                <span className="badge badge-ghost badge-sm">
                                  {t("room.ch.notVoted", {
                                    names: nonVoters
                                      .map((member) => member.display_name)
                                      .join(", "),
                                  })}
                                </span>
                              ) : null}
                            </div>
                          ) : null}

                          {challenge.status === "draw" ? (
                            <div className="alert alert-soft mt-1">
                              <span>{t("room.ch.drawAlert")}</span>
                            </div>
                          ) : null}

                          {winningPick ? (
                            <div className="rounded-box border border-success/20 bg-base-100 p-3">
                              <p className="font-display text-xs font-bold uppercase tracking-widest text-success">
                                {t("room.ch.resultTitle")}
                              </p>

                              <p className="mt-2 text-sm">
                                {t("room.ch.winnersLabel")}
                                {winners.length > 0
                                  ? winners
                                      .map(
                                        (vote) =>
                                          vote.display_name ?? t("common.guest"),
                                      )
                                      .join(", ")
                                  : t("room.ch.winnersNone")}
                              </p>

                              {losers.length > 0 ? (
                                <ul className="mt-2 flex flex-col gap-1 text-sm">
                                  {losers.map((vote) => (
                                    <li
                                      key={vote.guest_id}
                                      className="flex flex-wrap items-center gap-2"
                                    >
                                      <span>
                                        😵 {vote.display_name ?? t("common.guest")}
                                      </span>
                                      {vote.punishment_done ? (
                                        <span className="badge badge-soft badge-success badge-sm">
                                          {t("room.ch.punishDone")}
                                        </span>
                                      ) : (
                                        <span className="badge badge-soft badge-warning badge-sm">
                                          {t("room.ch.punishPending")}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-2 text-sm text-base-content/70">
                                  {t("room.ch.noLosers")}
                                </p>
                              )}

                              {myLosingVote && !myLosingVote.punishment_done ? (
                                <button
                                  type="button"
                                  disabled={activePunishmentDoneId === challenge.id}
                                  onClick={() => void handlePunishmentDone(challenge.id)}
                                  className="btn btn-outline btn-primary btn-sm mt-3 w-full sm:w-fit"
                                >
                                  {activePunishmentDoneId === challenge.id ? (
                                    <>
                                      <span className="loading loading-spinner loading-sm"></span>
                                      {t("room.composer.submitting")}
                                    </>
                                  ) : (
                                    t("room.ch.iDidPunish")
                                  )}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        <footer className="footer footer-center rounded-box border border-base-content/5 bg-base-100/50 p-4 text-sm text-base-content/60 backdrop-blur-sm">
          <p>{t("room.footer")}</p>
        </footer>
      </main>
    </div>
  );
}
