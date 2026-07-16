"use client";

import { useState, useTransition } from "react";
import { Laptop } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutDevice, signOutAllDevices } from "../actions";

export interface DeviceSessionRow {
  id: string;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
}

export interface DeviceSessionsListProps {
  deviceSessions: DeviceSessionRow[];
}

export function DeviceSessionsList({ deviceSessions: initial }: DeviceSessionsListProps) {
  const [deviceSessions, setDeviceSessions] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAll, startAllTransition] = useTransition();
  const [, startTransition] = useTransition();

  function handleSignOut(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await signOutDevice(id);
      setPendingId(null);
      if (!result.ok) {
        setError(result.error ?? "Could not sign out this device.");
        return;
      }
      setDeviceSessions((prev) => prev.filter((d) => d.id !== id));
    });
  }

  function handleSignOutEverywhere() {
    if (!window.confirm("Sign out of every device? You'll need to sign in again here too.")) return;
    setError(null);
    startAllTransition(async () => {
      await signOutAllDevices();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {deviceSessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No device history yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {deviceSessions.map((device) => (
            <li
              key={device.id}
              className="flex flex-col gap-2 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <Laptop className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    {device.deviceName ?? device.userAgent ?? "Unknown device"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {device.ipAddress ?? "Unknown IP"} · Last active{" "}
                    {new Date(device.lastActiveAt).toLocaleString()}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSignOut(device.id)}
                disabled={pendingId === device.id}
              >
                {pendingId === device.id ? "Signing out..." : "Sign out"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={handleSignOutEverywhere}
          disabled={pendingAll}
        >
          {pendingAll ? "Signing out..." : "Log out everywhere"}
        </Button>
      </div>
    </div>
  );
}
