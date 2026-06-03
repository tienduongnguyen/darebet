import { NextResponse } from "next/server";

const removedResponse = () =>
  NextResponse.json(
    {
      error: "Proof upload workflow has been removed.",
    },
    {
      status: 410,
    },
  );

export async function GET() {
  return removedResponse();
}

export async function POST() {
  return removedResponse();
}

