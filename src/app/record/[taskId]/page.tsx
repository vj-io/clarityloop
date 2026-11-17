"use client";
import { useParams } from "next/navigation";
import { RecordView } from "@/components/biz/RecordView";

export default function RecordPage() {
  const { taskId } = useParams<{ taskId: string }>();
  return <RecordView taskId={taskId} />;
}
