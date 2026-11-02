import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { unauthorized } from "@/lib/api-errors";
import { clearFinishedBackgroundTasks, listBackgroundTasks } from "@/lib/background-tasks";

/**
 * GET /api/tasks
 * 当前用户的后台事务：进行中的和最近 30 分钟内结束的
 */
export async function GET() {
    const user = await getCurrentUser();
    if (!user) {
        return unauthorized("Authentication required");
    }
    return NextResponse.json({ tasks: listBackgroundTasks(user.id) });
}

/**
 * DELETE /api/tasks
 * 清除当前用户已结束的事务记录（进行中的不受影响）
 */
export async function DELETE() {
    const user = await getCurrentUser();
    if (!user) {
        return unauthorized("Authentication required");
    }
    clearFinishedBackgroundTasks(user.id);
    return NextResponse.json({ tasks: listBackgroundTasks(user.id) });
}
