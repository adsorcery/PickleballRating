import { T } from "@/components/t";
import { Predictor } from "@/components/public/predictor";
import { getDb } from "@/lib/db/client";
import { listSelectablePlayers } from "@/lib/queries";
import { getActiveConfig } from "@/lib/services/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Predict a Match" };

export default function PredictPage() {
  const db = getDb();
  const players = listSelectablePlayers(db);
  const { config } = getActiveConfig(db);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">
          <T k="predictor.title" />
        </h1>
        <p className="text-muted-foreground">
          <T k="predictor.subtitle" en="Pick two teams to see each side's chance of winning a game." />
        </p>
      </header>
      {players.length < 4 ? (
        <p className="rounded-xl bg-muted p-4 text-sm">At least four active players are needed before predictions are available.</p>
      ) : (
        <Predictor players={players} beta={config.beta} />
      )}
    </div>
  );
}
