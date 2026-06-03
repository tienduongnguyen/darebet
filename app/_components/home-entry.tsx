"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { getTeamFlag } from "@/lib/domain/country-flags";
import { useGuestIdentity } from "@/lib/hooks/use-guest-identity";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/messages";
import { copyTextToClipboard } from "@/lib/utils/clipboard";
import { isUuid, sanitizeText } from "@/lib/validation/common";

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

interface RoomResponse {
  room: {
    id: string;
    room_name: string;
    created_at: string;
  };
}

interface MyRoomsPayload {
  rooms: Array<{
    id: string;
    room_name: string;
    created_at: string;
    joined_at: string;
    is_host: boolean;
  }>;
}

interface VotedMatchesPayload {
  voted_matches: Array<{
    challenge_id: string;
    challenge_status: "voting" | "home_won" | "away_won" | "draw";
    voting_deadline: string;
    pick: "home" | "away";
    voted_at: string;
    room_id: string;
    room_name: string | null;
    match: {
      id: string;
      home_team: string;
      away_team: string;
      commence_time: string;
      status: "uncommenced" | "live" | "completed";
      home_score: number | null;
      away_score: number | null;
    };
  }>;
}

interface ApiErrorPayload {
  error?: string;
  code?: string;
}

const readApiErrorMessage = async (
  response: Response,
  t: Translate,
): Promise<string> => {
  try {
    const payload = (await response.json()) as ApiErrorPayload;

    if (payload.code === "room_limit_reached") {
      return t("home.create.errRoomLimit");
    }

    if (payload.code === "room_name_rejected") {
      return t("home.create.errRoomNameBlocked");
    }

    if (payload.code === "display_name_rejected") {
      return t("home.errNameBlocked");
    }

    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    return t("common.serverError");
  }

  return t("common.serverError");
};

export function HomeEntry() {
  const router = useRouter();
  const { t, formatDateTime } = useI18n();
  const { profile, isBootstrapping, updateDisplayName } = useGuestIdentity();

  const [nameInput, setNameInput] = useState("");
  const [roomNameInput, setRoomNameInput] = useState("");
  const [createPasscodeInput, setCreatePasscodeInput] = useState("");
  const [joinRoomIdInput, setJoinRoomIdInput] = useState("");
  const [joinPasscodeInput, setJoinPasscodeInput] = useState("");

  const [identityError, setIdentityError] = useState("");
  const [createError, setCreateError] = useState("");
  const [joinError, setJoinError] = useState("");

  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const [myRooms, setMyRooms] = useState<MyRoomsPayload["rooms"]>([]);
  const [votedMatches, setVotedMatches] = useState<
    VotedMatchesPayload["voted_matches"]
  >([]);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [copiedRoomId, setCopiedRoomId] = useState("");

  const hasDisplayName = Boolean(profile?.display_name);
  const guestId = profile?.guest_id;

  const fetchOverview = useCallback(async () => {
    if (!guestId) {
      return;
    }

    setIsLoadingOverview(true);
    setOverviewError("");

    try {
      const guestQuery = `guestId=${encodeURIComponent(guestId)}`;

      const [roomsResponse, votedResponse] = await Promise.all([
        fetch(`/api/rooms?${guestQuery}`, {
          method: "GET",
          cache: "no-store",
        }),
        fetch(`/api/matches/voted?${guestQuery}`, {
          method: "GET",
          cache: "no-store",
        }),
      ]);

      if (!roomsResponse.ok || !votedResponse.ok) {
        setMyRooms([]);
        setVotedMatches([]);
        setOverviewError(
          await readApiErrorMessage(
            roomsResponse.ok ? votedResponse : roomsResponse,
            t,
          ),
        );
        return;
      }

      const [roomsPayload, votedPayload] = await Promise.all([
        roomsResponse.json() as Promise<MyRoomsPayload>,
        votedResponse.json() as Promise<VotedMatchesPayload>,
      ]);

      setMyRooms(roomsPayload.rooms);
      setVotedMatches(votedPayload.voted_matches);
    } catch {
      setMyRooms([]);
      setVotedMatches([]);
      setOverviewError(t("home.rooms.errLoad"));
    } finally {
      setIsLoadingOverview(false);
    }
  }, [guestId, t]);

  useEffect(() => {
    if (!guestId || !hasDisplayName) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchOverview();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchOverview, guestId, hasDisplayName]);

  const handleCopyRoomId = async (roomId: string) => {
    const copied = await copyTextToClipboard(roomId);

    if (!copied) {
      setOverviewError(t("home.rooms.errCopy"));
      return;
    }

    setOverviewError("");
    setCopiedRoomId(roomId);
    window.setTimeout(() => setCopiedRoomId(""), 2000);
  };

  const guestIdPreview = profile?.guest_id
    ? `${profile.guest_id.slice(0, 8)}...${profile.guest_id.slice(-4)}`
    : "";

  const handleIdentitySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextDisplayName = sanitizeText(nameInput);

    if (nextDisplayName.length < 2 || nextDisplayName.length > 24) {
      setIdentityError(t("home.setName.errLength"));
      return;
    }

    const updatedProfile = updateDisplayName(nextDisplayName);

    if (!updatedProfile) {
      setIdentityError(t("home.setName.errRequired"));
      return;
    }

    setIdentityError("");
    setNameInput(updatedProfile.display_name);
  };

  const handleCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profile?.guest_id) {
      setCreateError(t("common.identityNotReady"));
      return;
    }

    const roomName = sanitizeText(roomNameInput);
    const passcode = sanitizeText(createPasscodeInput);

    if (roomName.length < 3 || roomName.length > 40) {
      setCreateError(t("home.create.errName"));
      return;
    }

    if (!/^\d{4}$/.test(passcode)) {
      setCreateError(t("home.create.errPass"));
      return;
    }

    setCreateError("");
    setIsCreating(true);

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomName,
          passcode,
          guestId: profile.guest_id,
          displayName: profile.display_name,
        }),
      });

      if (!response.ok) {
        setCreateError(await readApiErrorMessage(response, t));
        return;
      }

      const payload = (await response.json()) as RoomResponse;
      router.push(`/rooms/${payload.room.id}`);
    } catch {
      setCreateError(t("home.create.errCreate"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profile?.guest_id) {
      setJoinError(t("common.identityNotReady"));
      return;
    }

    const roomId = sanitizeText(joinRoomIdInput);
    const passcode = sanitizeText(joinPasscodeInput);

    if (!isUuid(roomId)) {
      setJoinError(t("home.join.errId"));
      return;
    }

    if (!/^\d{4}$/.test(passcode)) {
      setJoinError(t("home.create.errPass"));
      return;
    }

    setJoinError("");
    setIsJoining(true);

    try {
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId,
          passcode,
          guestId: profile.guest_id,
          displayName: profile.display_name,
        }),
      });

      if (!response.ok) {
        setJoinError(await readApiErrorMessage(response, t));
        return;
      }

      const payload = (await response.json()) as RoomResponse;
      router.push(`/rooms/${payload.room.id}`);
    } catch {
      setJoinError(t("home.join.errJoin"));
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6 md:py-12">
        <section className="hero relative overflow-hidden rounded-box border border-base-content/5 bg-base-100 shadow-xl animate-rise">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-accent to-secondary"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-12 select-none text-[10rem] leading-none opacity-[0.06] animate-float md:-right-4 md:text-[14rem]"
          >
            ⚽
          </div>
          <div className="hero-content w-full flex-col items-start gap-3 px-5 py-10 text-left md:px-8 md:py-12">
            <span className="badge badge-soft badge-primary badge-sm md:badge-md">
              {t("home.badge")}
            </span>
            <h1 className="font-display text-5xl font-extrabold uppercase leading-none tracking-tight md:text-7xl">
              Dare
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Bet
              </span>
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-base-content/70">
              {t("home.intro")}
            </p>
          </div>
        </section>

        {isBootstrapping && (
          <section className="card card-border border-base-content/5 bg-base-100 shadow-md animate-rise stagger-1">
            <div className="card-body flex-row items-center gap-3">
              <span className="loading loading-spinner loading-md text-primary"></span>
              <p>{t("home.preparingIdentity")}</p>
            </div>
          </section>
        )}

        {!isBootstrapping && profile && !hasDisplayName && (
          <section className="card card-border border-base-content/5 bg-base-100 shadow-md animate-rise stagger-1">
            <div className="card-body">
              <h2 className="card-title font-display text-2xl uppercase tracking-wide">
                <span aria-hidden className="h-5 w-1 rounded-full bg-primary" />
                {t("home.setName.title")}
              </h2>
              <p className="text-sm text-base-content/70">
                {t("home.setName.desc", { id: guestIdPreview })}
              </p>

              <form onSubmit={handleIdentitySubmit}>
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">
                    {t("home.setName.legend")}
                  </legend>
                  <input
                    className="input w-full"
                    value={nameInput}
                    onChange={(event) => setNameInput(event.target.value)}
                    autoComplete="nickname"
                    placeholder={t("home.setName.placeholder")}
                  />
                  <p className="label">{t("home.setName.hint")}</p>
                </fieldset>

                {identityError ? (
                  <div role="alert" className="alert alert-error alert-soft mt-2">
                    <span>{identityError}</span>
                  </div>
                ) : null}

                <div className="card-actions mt-4">
                  <button type="submit" className="btn btn-primary btn-block sm:btn-wide">
                    {t("home.setName.continue")}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {!isBootstrapping && profile && hasDisplayName && (
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <article className="card card-border border-base-content/5 bg-base-100 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-xl animate-rise stagger-1">
              <div className="card-body">
                <h2 className="card-title font-display text-2xl uppercase tracking-wide">
                  <span aria-hidden className="h-5 w-1 rounded-full bg-primary" />
                  {t("home.create.title")}
                </h2>
                <p className="text-sm text-base-content/70">
                  {t("home.create.desc")}
                </p>

                <form onSubmit={handleCreateRoom}>
                  <fieldset className="fieldset">
                    <legend className="fieldset-legend">
                      {t("home.create.nameLegend")}
                    </legend>
                    <input
                      className="input w-full"
                      value={roomNameInput}
                      onChange={(event) => setRoomNameInput(event.target.value)}
                      placeholder={t("home.create.namePlaceholder")}
                    />

                    <legend className="fieldset-legend">
                      {t("home.create.passLegend")}
                    </legend>
                    <input
                      className="input w-full"
                      value={createPasscodeInput}
                      onChange={(event) => setCreatePasscodeInput(event.target.value)}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder={t("home.create.passPlaceholder")}
                    />
                  </fieldset>

                  {createError ? (
                    <div role="alert" className="alert alert-error alert-soft mt-2">
                      <span>{createError}</span>
                    </div>
                  ) : null}

                  <div className="card-actions mt-4">
                    <button
                      type="submit"
                      disabled={isCreating}
                      className="btn btn-primary btn-block"
                    >
                      {isCreating ? (
                        <>
                          <span className="loading loading-spinner loading-sm"></span>
                          {t("home.create.submitting")}
                        </>
                      ) : (
                        t("home.create.submit")
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </article>

            <article className="card card-border border-base-content/5 bg-base-100 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-secondary/25 hover:shadow-xl animate-rise stagger-2">
              <div className="card-body">
                <h2 className="card-title font-display text-2xl uppercase tracking-wide">
                  <span aria-hidden className="h-5 w-1 rounded-full bg-secondary" />
                  {t("home.join.title")}
                </h2>
                <p className="text-sm text-base-content/70">
                  {t("home.join.desc")}
                </p>

                <form onSubmit={handleJoinRoom}>
                  <fieldset className="fieldset">
                    <legend className="fieldset-legend">
                      {t("home.join.idLegend")}
                    </legend>
                    <input
                      className="input w-full font-mono"
                      value={joinRoomIdInput}
                      onChange={(event) => setJoinRoomIdInput(event.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    />

                    <legend className="fieldset-legend">
                      {t("home.create.passLegend")}
                    </legend>
                    <input
                      className="input w-full"
                      value={joinPasscodeInput}
                      onChange={(event) => setJoinPasscodeInput(event.target.value)}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder={t("home.create.passPlaceholder")}
                    />
                  </fieldset>

                  {joinError ? (
                    <div role="alert" className="alert alert-error alert-soft mt-2">
                      <span>{joinError}</span>
                    </div>
                  ) : null}

                  <div className="card-actions mt-4">
                    <button
                      type="submit"
                      disabled={isJoining}
                      className="btn btn-secondary btn-block"
                    >
                      {isJoining ? (
                        <>
                          <span className="loading loading-spinner loading-sm"></span>
                          {t("home.join.submitting")}
                        </>
                      ) : (
                        t("home.join.submit")
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </article>
          </section>
        )}

        {!isBootstrapping && profile && hasDisplayName && (
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <article className="card card-border border-base-content/5 bg-base-100 shadow-md animate-rise stagger-3">
              <div className="card-body">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="card-title font-display text-2xl uppercase tracking-wide">
                    <span aria-hidden className="h-5 w-1 rounded-full bg-accent" />
                    {t("home.rooms.title")}
                  </h2>
                  <button
                    type="button"
                    onClick={() => void fetchOverview()}
                    disabled={isLoadingOverview}
                    className="btn btn-ghost btn-sm"
                  >
                    {isLoadingOverview ? (
                      <span className="loading loading-spinner loading-sm"></span>
                    ) : (
                      t("common.refresh")
                    )}
                  </button>
                </div>
                <p className="text-sm text-base-content/70">
                  {t("home.rooms.desc")}
                </p>

                {overviewError ? (
                  <div role="alert" className="alert alert-error alert-soft mt-2">
                    <span>{overviewError}</span>
                  </div>
                ) : null}

                {!overviewError && !isLoadingOverview && myRooms.length === 0 ? (
                  <p className="mt-3 text-sm text-base-content/70">
                    {t("home.rooms.empty")}
                  </p>
                ) : null}

                {myRooms.length > 0 ? (
                  <ul className="list mt-3 max-h-72 overflow-y-auto rounded-box bg-base-200">
                    {myRooms.map((room) => (
                      <li
                        key={room.id}
                        className="list-row items-center transition-colors duration-200 hover:bg-base-300/50"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1 font-medium">
                            {room.room_name}
                            {room.is_host ? (
                              <span className="badge badge-soft badge-secondary badge-xs">
                                {t("common.host")}
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate font-mono text-sm text-base-content/60">
                            {room.id}
                          </p>
                          <p className="text-sm text-base-content/60">
                            {t("common.joinedAt", {
                              date: formatDateTime(room.joined_at),
                            })}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-stretch gap-1 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            onClick={() => void handleCopyRoomId(room.id)}
                            className={`btn btn-xs whitespace-nowrap ${copiedRoomId === room.id ? "btn-success" : "btn-outline btn-primary"}`}
                          >
                            {copiedRoomId === room.id ? (
                              <span className="animate-pop">{t("common.copied")}</span>
                            ) : (
                              t("common.copyId")
                            )}
                          </button>
                          <Link
                            href={`/rooms/${room.id}`}
                            className="btn btn-primary btn-xs whitespace-nowrap"
                          >
                            {t("common.open")}
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </article>

            <article className="card card-border border-base-content/5 bg-base-100 shadow-md animate-rise stagger-4">
              <div className="card-body">
                <h2 className="card-title font-display text-2xl uppercase tracking-wide">
                  <span aria-hidden className="h-5 w-1 rounded-full bg-accent" />
                  {t("home.votes.title")}
                </h2>
                <p className="text-sm text-base-content/70">
                  {t("home.votes.desc")}
                </p>

                {!overviewError && !isLoadingOverview && votedMatches.length === 0 ? (
                  <p className="mt-3 text-sm text-base-content/70">
                    {t("home.votes.empty")}
                  </p>
                ) : null}

                {votedMatches.length > 0 ? (
                  <ul className="list mt-3 max-h-72 overflow-y-auto rounded-box bg-base-200">
                    {votedMatches.map((entry) => {
                      const pickedTeam =
                        entry.pick === "home"
                          ? entry.match.home_team
                          : entry.match.away_team;

                      return (
                        <li
                          key={entry.challenge_id}
                          className="list-row items-center transition-colors duration-200 hover:bg-base-300/50"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">
                              {getTeamFlag(entry.match.home_team)} {entry.match.home_team}{" "}
                              <span className="font-normal text-base-content/60">vs</span>{" "}
                              {entry.match.away_team} {getTeamFlag(entry.match.away_team)}
                            </p>
                            <p className="text-sm text-base-content/60">
                              {t("common.kickoff", {
                                date: formatDateTime(entry.match.commence_time),
                              })}
                              {entry.room_name ? ` • ${entry.room_name}` : ""}
                            </p>
                            <p className="mt-1 text-xs">
                              <span className="badge badge-soft badge-primary badge-xs">
                                {t("home.votes.yourPick", {
                                  team: `${getTeamFlag(pickedTeam)} ${pickedTeam}`,
                                })}
                              </span>
                            </p>
                          </div>
                          <Link
                            href={`/rooms/${entry.room_id}`}
                            className="btn btn-outline btn-primary btn-xs shrink-0 self-center whitespace-nowrap"
                          >
                            {t("common.open")}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </article>
          </section>
        )}

        <section className="card border border-base-content/5 bg-base-100/50 backdrop-blur-sm animate-rise stagger-5">
          <div className="card-body gap-3 text-sm text-base-content/70">
            <p>{t("home.footer.account")}</p>
            <p>
              {t("home.footer.haveUrlBefore")}
              <span className="font-mono font-medium text-base-content">
                /rooms/&lt;room-id&gt;
              </span>
              {t("home.footer.haveUrlAfter")}
            </p>
            <Link href="/" className="link link-primary w-fit">
              {t("home.footer.return")}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
