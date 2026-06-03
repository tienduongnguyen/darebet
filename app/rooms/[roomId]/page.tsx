import { RoomDashboard } from "@/app/_components/room-dashboard";

interface RoomPageProps {
  params: Promise<{
    roomId: string;
  }>;
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;

  return <RoomDashboard roomId={roomId} />;
}
