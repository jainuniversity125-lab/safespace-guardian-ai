import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { analyzeEvidence, createEvidenceUploadUrl } from "@/lib/evidence.functions";

const MAX_BYTES = 25 * 1024 * 1024;

function kindOf(mime: string): "image" | "video" | "audio" | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

export function EvidenceUploader({
  reportId,
  contentId,
  label = "Attach evidence (screenshot, clip or voice note)",
}: {
  reportId?: string | undefined;
  contentId?: string | undefined;
  label?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const analyze = useServerFn(analyzeEvidence);
  const getUploadUrl = useServerFn(createEvidenceUploadUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<null | "uploading" | "extracting">(null);

  async function onFile(file: File) {
    const kind = kindOf(file.type);
    if (!kind) {
      toast.error("Only images, video or audio can be attached.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Files must be 25 MB or smaller.");
      return;
    }
    if (!user) {
      toast.error("Sign in to attach evidence.");
      return;
    }

    setStage("uploading");
    try {
      // Time-limited, single-use signed upload URL scoped to this user's folder.
      const { path, token } = await getUploadUrl({
        data: {
          fileName: file.name,
          mediaKind: kind,
          mimeType: file.type,
          fileSize: file.size,
        },
      });

      const up = await supabase.storage
        .from("evidence")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (up.error) throw new Error(up.error.message);

      setStage("extracting");
      const job = await analyze({
        data: {
          storagePath: path,
          mediaKind: kind,
          mimeType: file.type,
          fileSize: file.size,
          reportId: reportId ?? null,
          contentId: contentId ?? null,
        },
      });

      if (job.job_status === "done") {
        toast.success(
          kind === "image"
            ? `Text extracted from the image · severity ${job.severity}`
            : `Speech transcribed · severity ${job.severity}`,
        );
      } else {
        toast.error("Extraction failed — the item is queued for retry and manual review.");
      }
      void qc.invalidateQueries({ queryKey: ["evidence"] });
      void qc.invalidateQueries({ queryKey: ["my-evidence"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStage(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={stage !== null}
        onClick={() => inputRef.current?.click()}
      >
        {stage ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {stage === "uploading"
          ? "Uploading securely…"
          : stage === "extracting"
            ? "Extracting text & speech…"
            : label}
      </Button>
      <p className="text-xs text-muted-foreground">
        Uploads use a one-time signed link and are stored in a private bucket. Images and video
        frames are read with OCR; audio and video speech is transcribed. Job progress, confidence
        and retries are shown on each item. Extracted text is scored, never auto-enforced.
      </p>
    </div>
  );
}
