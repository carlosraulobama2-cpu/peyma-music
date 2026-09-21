function getGreeting(hour: number): string {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function Greeting({ name }: { name: string }) {
  return (
    <h1 className="text-3xl font-bold tracking-tight">
      {getGreeting(new Date().getHours())}, {name.split(" ")[0]}
    </h1>
  );
}
