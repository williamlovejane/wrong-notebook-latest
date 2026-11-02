import { getServerSession } from "next-auth";
import { authOptions } from "../auth";
import { prisma } from "../prisma";

export interface CurrentUser {
    id: string;
    email: string;
    role: string;
}

/** 取当前登录用户，未登录返回 null */
export async function getCurrentUser(): Promise<CurrentUser | null> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return null;

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, email: true, role: true },
    });

    return user;
}
