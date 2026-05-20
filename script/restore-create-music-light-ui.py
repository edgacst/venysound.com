#!/usr/bin/env python3
"""Restore CreateMusic light UI (17fd961 layout) while keeping voice-record + lyrics assist."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "client/src/pages/CreateMusic.tsx"
OLD_REF = subprocess.check_output(
    ["git", "show", "17fd961:client/src/pages/CreateMusic.tsx"],
    cwd=ROOT,
    text=True,
    encoding="utf-8",
)


def extract_return_block(source: str) -> str:
    m = re.search(r"\n  return \(\n    <PageTransition>", source)
    if not m:
        raise RuntimeError("return block not found")
    start = m.start() + 1
    # closing `  );` before final `}`
    end_m = re.search(r"\n  \);\n\}\s*$", source[start:])
    if not end_m:
        raise RuntimeError("return end not found")
    return source[start : start + end_m.start() + len("\n  );")]


def extract_voice_dialog(return_block: str) -> str:
    m = re.search(
        r"\n      <Dialog\n        open=\{voiceRecordOpen\}.*?</Dialog>\n",
        return_block,
        re.DOTALL,
    )
    if not m:
        raise RuntimeError("voice record dialog not found in current return")
    return m.group(0)


VOICE_CHIP = r"""
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={instrumentalOnly || isSubmitting || voiceRecordSubmitting}
                          onClick={() => {
                            resetVoiceRecordDraft();
                            setInstrumentalOnly(false);
                            setMode("custom");
                            setVoiceRecordOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                          title={t(
                            "createMusic.voiceRecordChipHint",
                            "멜로디·허밍을 녹음한 뒤 가사란 내용으로 AI 보컬 곡 생성 (KIE)",
                          )}
                        >
                          <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {t("createMusic.voiceRecordChip", "보이스 녹음 생성")}
                        </button>
                      </div>
"""

LYRICS_ASSIST_HEADER = r"""
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                          <label className="block text-sm font-medium">
                            {mode === "custom"
                              ? instrumentalOnly
                                ? t("createMusic.promptLabelInstrumental", "가사 (연주만이면 비워도 됨)")
                                : t("createMusic.promptLabel", "가사 (필수)")
                              : t("createMusic.lyricsInputLabel", "가사입력(가사가 있는 곡은 가사를 입력하세요)")}
                          </label>
                          {!instrumentalOnly && (
                            <div className="flex flex-wrap items-center gap-2 ml-auto">
                              <button
                                type="button"
                                onClick={() => void handleStudioOptimizeLyrics()}
                                disabled={lyricsAssistLoading !== null}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:border-violet-300 hover:text-violet-800 transition-colors disabled:opacity-50"
                              >
                                {lyricsAssistLoading === "optimize" ? (
                                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                                ) : (
                                  <Wand2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                )}
                                {t("createMusic.studioLyricsOptimize", "최적화")}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleStudioGenerateLyrics()}
                                disabled={lyricsAssistLoading !== null}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs text-violet-800 hover:border-violet-300 transition-colors disabled:opacity-50"
                              >
                                {lyricsAssistLoading === "generate" ? (
                                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                                ) : (
                                  <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                )}
                                {t("createMusic.studioLyricsGenerate", "가사 생성")}
                              </button>
                            </div>
                          )}
                        </div>
"""

VOICE_DIALOG_LIGHT = r"""
      <Dialog
        open={voiceRecordOpen}
        onOpenChange={(open) => {
          if (!open) {
            setVoiceRecordOpen(false);
            resetVoiceRecordDraft();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("createMusic.voiceRecordDialogTitle", "보이스 녹음 생성")}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {t(
                    "createMusic.voiceRecordDialogLead",
                    "멜로디·허밍·가이드 보컬을 30초 이내로 녹음합니다. 가사란에 넣을 가사와 장르·스타일을 먼저 적어 두세요. 녹음은 KIE에 업로드된 뒤 AI가 그 위에 노래 보컬을 입힙니다.",
                  )}
                </p>
                <p className="text-xs">
                  {t(
                    "createMusic.voiceRecordDialogLegal",
                    "타인의 목소리·곡을 무단으로 모방하지 마세요. 서버에 KIE_API_KEY가 설정되어 있어야 합니다.",
                  )}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            {voiceRecState !== "recording" ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => void startRecording().catch(() => {
                  toast({
                    title: t("createMusic.voiceRecordMicDenied", "마이크 권한이 필요합니다."),
                    variant: "destructive",
                  });
                })}
              >
                <Mic className="h-4 w-4" aria-hidden />
                {t("createMusic.voiceRecordStart", "녹음 시작")}
              </Button>
            ) : (
              <Button type="button" variant="destructive" className="gap-2" onClick={() => void handleVoiceRecordStop()}>
                <span className="h-2 w-2 rounded-full bg-white animate-pulse" aria-hidden />
                {t("createMusic.voiceRecordStop", "녹음 중지")}
              </Button>
            )}
            {(voiceRecordBlob || voiceRecState === "stopped") && (
              <Button type="button" variant="ghost" onClick={resetVoiceRecordDraft}>
                {t("createMusic.voiceRecordClear", "다시 녹음")}
              </Button>
            )}
          </div>

          {voiceRecordPreviewUrl ? (
            <audio src={voiceRecordPreviewUrl} controls className="w-full rounded-lg" preload="metadata" />
          ) : (
            <p className="text-xs text-muted-foreground">{t("createMusic.voiceRecordPreviewHint", "녹음 후 여기서 들을 수 있습니다.")}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setVoiceRecordOpen(false)}>
              {t("common.cancel", "취소")}
            </Button>
            <Button
              type="button"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              disabled={!voiceRecordBlob || voiceRecordSubmitting}
              onClick={() => void handleCreateFromVoiceRecord()}
            >
              {voiceRecordSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden /> : null}
              {t("createMusic.voiceRecordSubmit", "이 녹음으로 생성")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
"""


def patch_old_return(old_return: str) -> str:
    # After mode radio block, insert voice chip
    anchor = '                            <span>{t("createMusic.modeCustom", "가사 직접 입력")}</span>\n                          </label>\n                        </div>\n                      </div>'
    if anchor not in old_return:
        raise RuntimeError("mode radio anchor not found in old return")
    old_return = old_return.replace(anchor, anchor + VOICE_CHIP, 1)

    # Replace simple lyrics label with assist header
    lyrics_m = re.search(
        r"<div>\s*<label className=\"block text-sm font-medium mb-1\">.*?</label>\s*<textarea",
        old_return,
        re.DOTALL,
    )
    if not lyrics_m:
        raise RuntimeError("lyrics label block not found in old return")
    old_return = (
        old_return[: lyrics_m.start()]
        + "                      <div>\n"
        + LYRICS_ASSIST_HEADER
        + "\n                        <textarea"
        + old_return[lyrics_m.end() :]
    )

    # Submit button: keep classic label
    old_return = old_return.replace(
        ': t("createMusic.submit", "음악 생성하기")}',
        ': t("createMusic.submit", "음악 생성하기")}',
    )

    # Insert voice dialog before publish dialog
    pub = "\n      {/* 신곡 공개 동의 다이얼로그"
    if pub not in old_return:
        pub = '\n      <Dialog open={!!publishConfirm}'
    if pub not in old_return:
        raise RuntimeError("publish dialog anchor not found")
    old_return = old_return.replace(pub, VOICE_DIALOG_LIGHT + pub, 1)

    # Fix login box colors for light page
    old_return = old_return.replace(
        'text-amber-200 mb-4',
        'text-amber-900 mb-4',
    )
    return old_return


def strip_studio_helpers(logic: str) -> str:
    logic = re.sub(
        r"\n  const showStudioComingSoon = useCallback\(\(\) => \{.*?\n  \}, \[toast, t\]\);\n",
        "\n",
        logic,
        count=1,
        flags=re.DOTALL,
    )
    logic = re.sub(
        r"\n  const studioModelBadge =.*?\n\n",
        "\n",
        logic,
        count=1,
        flags=re.DOTALL,
    )
    if "Checkbox" not in logic:
        logic = logic.replace(
            'import { Select, SelectContent',
            'import { Checkbox } from "@/components/ui/checkbox";\nimport { Select, SelectContent',
        )
    # Remove Switch if only used in studio? grep Switch usage
    return logic


def main() -> None:
    current = TARGET.read_text(encoding="utf-8")
    old_return = extract_return_block(OLD_REF)
    new_return = patch_old_return(old_return)

    logic_end = current.find("\n  return (\n    <PageTransition>")
    if logic_end < 0:
        raise RuntimeError("current return not found")
    logic = current[:logic_end]
    logic = strip_studio_helpers(logic)

    out = logic + "\n" + new_return + "\n}\n"
    TARGET.write_text(out, encoding="utf-8", newline="\n")
    print(f"Wrote {TARGET} ({len(out.splitlines())} lines)")


if __name__ == "__main__":
    main()
