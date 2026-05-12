type Props = {
  airBins: string[] | null;
};

export function AirBinsTab({ airBins }: Props) {
  if (!airBins) return <p className="text-sm text-muted-foreground">loading…</p>;
  if (airBins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Bin IDリストが未登録です (input/air_bins.txt に追記してください)
      </p>
    );
  }
  return (
    <ul className="text-xs font-mono grid grid-cols-4 gap-1">
      {airBins.map((b) => (
        <li key={b} className="bg-muted rounded px-2 py-1">
          {b}
        </li>
      ))}
    </ul>
  );
}
