import { Mark } from "@/components/brand/Mark";

export function PageLoader() {
  return (
    <div className="grid min-h-[70svh] place-items-center" role="status" aria-label="Loading">
      <Mark size={44} animate />
    </div>
  );
}
