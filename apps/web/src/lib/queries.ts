import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./api";

const live = { placeholderData: keepPreviousData, retry: 1, refetchOnWindowFocus: true } as const;

export const useStatus = () => useQuery({ queryKey: ["status"], queryFn: api.status, refetchInterval: 30_000, ...live });
export const useRadar = () => useQuery({ queryKey: ["radar"], queryFn: api.radar, refetchInterval: 60_000, ...live });
export const useFairValue = (key: string) => useQuery({ queryKey: ["fv", key], queryFn: () => api.fairValue(key), refetchInterval: 60_000, ...live });
export const useWhich = (ticker: string) => useQuery({ queryKey: ["which", ticker], queryFn: () => api.which(ticker), enabled: ticker.length > 0, refetchInterval: 120_000, ...live });
export const useRounds = (limit = 50) => useQuery({ queryKey: ["rounds", limit], queryFn: () => api.rounds(limit), refetchInterval: 60_000, ...live });
export const useHistory = (key: string, hours = 72) => useQuery({ queryKey: ["history", key, hours], queryFn: () => api.history(key, hours), refetchInterval: 120_000, ...live });
export const useOnchain = () => useQuery({ queryKey: ["onchain"], queryFn: api.onchain, refetchInterval: 120_000, ...live });
export const useOpens = (forecaster = "nfv") => useQuery({ queryKey: ["opens", forecaster], queryFn: () => api.opens(forecaster), staleTime: 300_000, ...live });
export const useScoreboard = () => useQuery({ queryKey: ["scoreboard"], queryFn: api.scoreboard, staleTime: 300_000, ...live });
export const useResults = () => useQuery({ queryKey: ["results"], queryFn: api.results, staleTime: 300_000, ...live });
export const useX402 = () => useQuery({ queryKey: ["x402"], queryFn: api.x402, staleTime: 300_000, ...live });
