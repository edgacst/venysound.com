/**
 * 페이업·다날 **자동결제(배치키)** 규격: `starturl`로 POST, 필드명 `STARTPARAMS`.
 */
export function submitPayupBatchRegisterForm(starturl: string, startparams: string): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = starturl;
  form.style.display = "none";
  const p = document.createElement("input");
  p.type = "hidden";
  p.name = "STARTPARAMS";
  p.value = startparams;
  form.appendChild(p);
  document.body.appendChild(form);
  form.submit();
}

/**
 * [페이업] 인증결제 DANAL 다이렉트 규격서 3.2 — 결제창 시작.
 * - `STARTPARAMS`는 길이가 길 수 있어 숨김 `<textarea>`로 전송(일부 웹뷰에서 hidden input 잘림 완화).
 * - `accept-charset="UTF-8"`. iframe·웹뷰 이슈 시 빌드에 `VITE_PAYUP_DANAL_FORM_TARGET=_top` 시도.
 * - 자료에 `STARTURL` hidden 필드가 필수면 빌드 시 `VITE_PAYUP_DANAL_FORM_INCLUDE_STARTURL=true`.
 */
export type PayupDanalDirectCheckoutPayload = {
  starturl: string;
  startparams: string;
  cancelUrl: string;
  cardCode: string;
};

function payupDanalIncludeStartUrlHiddenField(): boolean {
  return (
    String(import.meta.env.VITE_PAYUP_DANAL_FORM_INCLUDE_STARTURL ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

export function submitPayupDanalDirectCheckout(payload: PayupDanalDirectCheckoutPayload): void {
  const { starturl, startparams, cancelUrl, cardCode } = payload;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const cancel =
    typeof cancelUrl === "string" && cancelUrl.trim().length > 0
      ? cancelUrl.trim().slice(0, 255)
      : `${origin}/pricing?payup=cancel`.slice(0, 255);

  const form = document.createElement("form");
  form.method = "POST";
  form.action = starturl;
  form.setAttribute("accept-charset", "UTF-8");
  form.enctype = "application/x-www-form-urlencoded";
  const formTarget = String(import.meta.env.VITE_PAYUP_DANAL_FORM_TARGET ?? "").trim().toLowerCase();
  form.target = formTarget === "_top" || formTarget === "_blank" ? formTarget : "_self";
  form.style.display = "none";

  const addHiddenInput = (name: string, value: string) => {
    const inp = document.createElement("input");
    inp.type = "hidden";
    inp.name = name;
    inp.value = value;
    form.appendChild(inp);
  };

  if (payupDanalIncludeStartUrlHiddenField()) {
    addHiddenInput("STARTURL", starturl);
  }

  const tp = document.createElement("textarea");
  tp.name = "STARTPARAMS";
  tp.value = startparams;
  tp.setAttribute("aria-hidden", "true");
  tp.tabIndex = -1;
  tp.style.position = "absolute";
  tp.style.left = "-9999px";
  tp.style.width = "1px";
  tp.style.height = "1px";
  tp.style.opacity = "0";
  form.appendChild(tp);

  addHiddenInput("CANCELURL", cancel);
  addHiddenInput("CARDCODE", cardCode.replace(/\D/g, "").padStart(4, "0").slice(0, 4));

  document.body.appendChild(form);
  form.submit();
}

/** 구독 등 인증결제 다이렉트 — 서버가 준 필드로 결제창 POST */
export function submitPayupDirectOrderForm(
  starturl: string,
  startparams: string,
  opts?: { cancelUrl?: string; cardCode?: string },
): void {
  submitPayupDanalDirectCheckout({
    starturl,
    startparams,
    cancelUrl: opts?.cancelUrl ?? "",
    cardCode: (opts?.cardCode ?? "0000").replace(/\D/g, "").padStart(4, "0").slice(0, 4),
  });
}
