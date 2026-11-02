import { redirect } from "next/navigation";

// 知识点页已合并到统计中心，旧链接跳转到对应 Tab
export default function TagsPage() {
    redirect("/stats?tab=tags");
}
