import { AceitarConvite } from "./AceitarConvite";

export const dynamic = "force-dynamic";
export const metadata = { title: "Convite", robots: { index: false } };

export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AceitarConvite token={token} />;
}
