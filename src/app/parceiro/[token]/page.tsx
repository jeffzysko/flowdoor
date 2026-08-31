import { AceitarParceria } from "./AceitarParceria";

export const dynamic = "force-dynamic";
export const metadata = { title: "Convite de parceria", robots: { index: false } };

export default async function ParceiroPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AceitarParceria token={token} />;
}
