/**
 * useSellerLocation — Browser geolocation hook for Seller App.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-03
 *
 * Permission states: idle | requesting | granted | denied | unavailable
 * Returns lat/lng when available, null otherwise.
 * Does NOT auto-request — caller triggers via requestLocation().
 */
"use client";

import { useState, useCallback, useRef } from "react";

export type LocationPermission = "idle" | "requesting" | "granted" | "denied" | "unavailable";

export interface SellerLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface UseSellerLocationResult {
  permission: LocationPermission;
  location: SellerLocation | null;
  requestLocation: () => void;
  error: string | null;
}

export function useSellerLocation(): UseSellerLocationResult {
  const [permission, setPermission] = useState<LocationPermission>("idle");
  const [location, setLocation] = useState<SellerLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requesting = useRef(false);

  const requestLocation = useCallback(() => {
    if (requesting.current) return;

    if (!navigator.geolocation) {
      setPermission("unavailable");
      setError("Geolocalizacion no disponible en este dispositivo");
      return;
    }

    requesting.current = true;
    setPermission("requesting");
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        requesting.current = false;
        setPermission("granted");
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        requesting.current = false;
        if (err.code === err.PERMISSION_DENIED) {
          setPermission("denied");
          setError("Permiso de ubicacion denegado");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setPermission("unavailable");
          setError("Ubicacion no disponible");
        } else {
          setPermission("idle");
          setError("Error al obtener ubicacion");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }, []);

  return { permission, location, requestLocation, error };
}
