import { redirect } from "next/navigation";

/**
 * 旧版「批次详情」页已下线。
 * 手写听写改为全部人工审核后，当天所有未判的字都直接列在扁平的「今日提交」里，
 * 不再需要先点进某个交卷批次。保留这个路由只是为了兼容旧书签与外链。
 */
export default function SubmissionDetailRedirect() {
    redirect("/dictation/submissions");
}
