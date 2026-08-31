import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/domain/session";
import { PageHead } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/domain/permissions";
import { PerfilForm } from "./PerfilForm";
import { TrocarSenha } from "./TrocarSenha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meu perfil" };

export default async function ContaPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/entrar");

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("full_name, nickname, phone, avatar_path")
    .eq("id", ctx.userId)
    .single();

  const p = (data ?? {}) as {
    full_name?: string | null;
    nickname?: string | null;
    phone?: string | null;
    avatar_path?: string | null;
  };

  return (
    <>
      <PageHead
        eyebrow="Sua conta"
        title="Meu perfil"
        lead={
          ctx.current
            ? `Você está em ${ctx.current.organizations.name} como ${ROLE_LABEL[ctx.current.role].toLowerCase()}.`
            : "Seus dados de acesso ao Flowdoor."
        }
      />

      <PerfilForm
        userId={ctx.userId}
        fullName={p.full_name ?? ""}
        nickname={p.nickname ?? ""}
        phone={p.phone ?? ""}
        email={ctx.email}
        avatarPath={p.avatar_path ?? ""}
        avatarUrl={ctx.avatarUrl}
      />

      <TrocarSenha />
    </>
  );
}
