/**
 * 페이업·다날 **자동결제(배치키) 카드등록** 규격: `starturl`로 POST, 필드명 `STARTPARAMS`.
 * **인증결제 다이렉트(구독 주문)** 응답도 동일하게 `starturl` + `STARTPARAMS` 로 결제창을 연다.
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

/** 구독 등 인증결제 다이렉트 — 서버가 준 `starturl` / `startparams` 로 결제창 POST */
export function submitPayupDirectOrderForm(starturl: string, startparams: string): void {
  submitPayupBatchRegisterForm(starturl, startparams);
}
