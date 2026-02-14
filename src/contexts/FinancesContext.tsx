"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

const FINANCES_PIN_KEY = "finances-pin";
const FINANCES_LOCKED_KEY = "finances-locked";

interface FinancesContextType {
    showRecs: boolean;
    setShowRecs: (v: boolean) => void;
    showGraph: boolean;
    setShowGraph: (v: boolean) => void;
    showEntries: boolean;
    setShowEntries: (v: boolean) => void;
    showPurchases: boolean;
    setShowPurchases: (v: boolean) => void;
    isLocked: boolean;
    setIsLocked: (v: boolean) => void;
    totalPortfolio: number;
    setTotalPortfolio: (v: number) => void;
    checkCode: (code: string) => boolean;
    setPin: (pin: string) => void;
    hasPin: boolean;
}

const FinancesContext = createContext<FinancesContextType | null>(null);

export function FinancesProvider({ children }: { children: React.ReactNode }) {
    const [showRecs, setShowRecs] = useState(false);
    const [showGraph, setShowGraph] = useState(false);
    const [showEntries, setShowEntries] = useState(false);
    const [showPurchases, setShowPurchases] = useState(false);
    const [totalPortfolio, setTotalPortfolio] = useState(0);
    const [isLocked, setIsLockedState] = useState(false);
    const [hasPin, setHasPin] = useState(false);
    useEffect(() => {
        const locked = localStorage.getItem(FINANCES_LOCKED_KEY) === "true";
        const pin = !!localStorage.getItem(FINANCES_PIN_KEY);
        setIsLockedState(locked && pin);
        setHasPin(pin);
    }, []);

    const setPin = useCallback((pin: string) => {
        if (pin) {
            localStorage.setItem(FINANCES_PIN_KEY, pin);
            setHasPin(true);
        }
    }, []);

    const checkCode = useCallback((code: string): boolean => {
        const stored = localStorage.getItem(FINANCES_PIN_KEY);
        if (!stored) return true;
        const ok = code === stored;
        if (ok) {
            localStorage.setItem(FINANCES_LOCKED_KEY, "false");
            setIsLockedState(false);
        }
        return ok;
    }, []);

    const setIsLocked = useCallback((v: boolean) => {
        localStorage.setItem(FINANCES_LOCKED_KEY, v ? "true" : "false");
        setIsLockedState(v);
    }, []);

    return (
        <FinancesContext.Provider
            value={{
                showRecs,
                setShowRecs,
                showGraph,
                setShowGraph,
                showEntries,
                setShowEntries,
                showPurchases,
                setShowPurchases,
                isLocked,
                setIsLocked,
                totalPortfolio,
                setTotalPortfolio,
                checkCode,
                setPin,
                hasPin,
            }}
        >
            {children}
        </FinancesContext.Provider>
    );
}

export function useFinances() {
    const ctx = useContext(FinancesContext);
    return ctx;
}
