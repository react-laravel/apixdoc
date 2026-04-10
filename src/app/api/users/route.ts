import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isUserRole, MIN_PASSWORD_LENGTH } from "@/lib/security";
import { type ApiResponse } from "@/lib/utils";

export async function GET(): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    if (session.user.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: users });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    if (session.user.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, name, password, role } = body;
    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedPassword = typeof password === "string" ? password : "";
    const normalizedRole =
      typeof role === "string" ? role.toLowerCase() : "user";

    if (!normalizedEmail || !normalizedName || !normalizedPassword) {
      return NextResponse.json(
        { success: false, error: "Email, name, and password are required" },
        { status: 400 }
      );
    }

    if (normalizedPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        },
        { status: 400 }
      );
    }

    if (!isUserRole(normalizedRole)) {
      return NextResponse.json(
        { success: false, error: "Invalid role" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Email already exists" },
        { status: 409 }
      );
    }

    const hashedPassword = await hash(normalizedPassword, 10);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: normalizedName,
        password: hashedPassword,
        role: normalizedRole,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: user }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to create user" },
      { status: 500 }
    );
  }
}
