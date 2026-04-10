import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { RegisterForm } from "@/components/RegisterForm";
import { recordSignupPageViewDeduped } from "@/lib/analytics-conversion";

export default function Register() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) setLocation("/");
  }, [user, setLocation]);

  useEffect(() => {
    recordSignupPageViewDeduped();
  }, []);

  if (user) return null;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <RegisterForm variant="page" />
      </div>
    </div>
  );
}
