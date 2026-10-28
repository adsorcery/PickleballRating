import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminPage } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminHome() {
  const admin = await requireAdminPage();
  return (
    <>
      <AdminNav email={admin.email} />
      <h1 className="text-2xl font-extrabold">Admin</h1>
    </>
  );
}
