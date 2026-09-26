import { Moon, CloudSun, Sun } from "lucide-react";

function getGreeting(hour: number): string {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** Mismo corte horario que `getGreeting`, para que el ícono nunca quede desincronizado del texto. */
function getGreetingIcon(hour: number) {
  if (hour < 6) return { Icon: Moon, tint: "#8B93FF" };
  if (hour < 12) return { Icon: CloudSun, tint: "#FFB84D" };
  if (hour < 19) return { Icon: Sun, tint: "#FFD24D" };
  return { Icon: Moon, tint: "#8B93FF" };
}

export function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours();
  const { Icon, tint } = getGreetingIcon(hour);

  return (
    <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${tint}26` }}>
        <Icon size={19} color={tint} strokeWidth={2.25} />
      </span>
      {getGreeting(hour)}, {name.split(" ")[0]}
    </h1>
  );
}
