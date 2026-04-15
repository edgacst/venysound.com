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
 * `STARTURL`은 **form.action**으로만 전달하고, 본문에 `STARTURL` hidden을 중복 넣지 않음(배치키 폼과 동일).
 * 중복 시 결제창 단계에서 전문 파싱 오류가 날 수 있음.
 */
export type PayupDanalDirectCheckoutPayload = {
  starturl: string;
  startparams: string;
  cancelUrl: string;
  cardCode: string;
};

export function submitPayupDanalDirectCheckout(payload: PayupDanalDirectCheckoutPayload): void {
  const { starturl, startparams, cancelUrl, cardCode } = payload;
  const form = document.createElement("form");
  form.method = "POST";
  form.action = starturl;
  form.style.display = "none";
  const add = (name: string, value: string) => {
    const inp = document.createElement("input");
    inp.type = "hidden";
    inp.name = name;
    inp.value = value;
    form.appendChild(inp);
  };
  add("STARTPARAMS", startparams);
  add("CANCELURL", cancelUrl);
  add("CARDCODE", cardCode.slice(0, 4));
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
