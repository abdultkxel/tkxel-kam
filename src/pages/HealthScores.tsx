import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const scores = [
  { account: "Acme Corporation", score: 85, trend: "up" },
  { account: "Beta Industries", score: 45, trend: "down" },
  { account: "Gamma Ltd", score: 72, trend: "stable" },
  { account: "Delta Corp", score: 91, trend: "up" },
  { account: "Epsilon Tech", score: 28, trend: "down" },
];

function getScoreColor(score: number) {
  if (score >= 70) return "text-success";
  if (score >= 40) return "text-warning";
  return "text-destructive";
}

function getProgressColor(score: number) {
  if (score >= 70) return "[&>div]:bg-success";
  if (score >= 40) return "[&>div]:bg-warning";
  return "[&>div]:bg-destructive";
}

export default function HealthScores() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Health Scores</h1>
        <p className="text-sm text-muted-foreground mt-1">Account health monitoring and trends</p>
      </div>
      <div className="space-y-3">
        {scores.map((item) => (
          <Card key={item.account}>
            <CardContent className="py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.account}</p>
              </div>
              <div className="w-48">
                <Progress value={item.score} className={`h-2 ${getProgressColor(item.score)}`} />
              </div>
              <span className={`text-lg font-semibold w-12 text-right ${getScoreColor(item.score)}`}>
                {item.score}
              </span>
              <span className="text-xs text-muted-foreground w-12">{item.trend === "up" ? "↑" : item.trend === "down" ? "↓" : "→"}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
