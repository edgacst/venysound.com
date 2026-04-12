/**
 * 페이업·다날 **자동결제(배치키) 카드등록** 규격: `starturl`로 POST, 필드명 `STARTPARAMS`.
 * 인증결제 다이렉트는 규격서대로 `checkout.teledit.com` 스크립트 로드 + 폼 필드 구성이 필요해 별도 페이지에서 처리하세요.
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
