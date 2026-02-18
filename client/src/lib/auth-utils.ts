export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

export function redirectToLogin(toast?: (options: { title: string; description: string; variant: string }) => void) {
  if (toast) {
    toast({
      title: "로그인 필요",
      description: "로그인이 필요합니다. 로그인 페이지로 이동합니다.",
      variant: "destructive",
    });
  }
  setTimeout(() => {
    window.location.href = "/login";
  }, 500);
}
