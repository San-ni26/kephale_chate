'use client';

import { createContext, useContext, useState, useCallback } from 'react';

interface CallContextValue {
    isInCall: boolean;
    setInCall: (value: boolean) => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
    const [isInCall, setIsInCall] = useState(false);
    const setInCall = useCallback((value: boolean) => setIsInCall(value), []);
    return (
        <CallContext.Provider value={{ isInCall, setInCall }}>
            {children}
        </CallContext.Provider>
    );
}

export function useCallContext() {
    const ctx = useContext(CallContext);
    return ctx;
}
