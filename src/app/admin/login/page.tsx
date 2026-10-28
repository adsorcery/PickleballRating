import { redirect } from "next/navigation";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getCurrentAdmin } from "@/lib/auth/guard";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin sign-in" };

export default async function LoginPage() {
  if (await getCurrentAdmin()) redirect("/admin");
  return (
    <div className="mx-auto max-w-sm">
      <Card className="space-y-4">
        <div>
          <CardTitle>Admin sign-in</CardTitle>
          <CardDescription>Only administrators can add players or record matches.</CardDescription>
        </div>
        <LoginForm />
      </Card>
    </div>
  );
}
