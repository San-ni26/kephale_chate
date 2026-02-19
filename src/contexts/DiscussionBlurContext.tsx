'use client';

import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface DiscussionBlurState {
    showBlurToggle: boolean;
    blurEnabled: boolean;
    onToggle: () => void;
}

interface DiscussionBlurContextValue {
    blurState: DiscussionBlurState | null;
    setBlurState: (state: DiscussionBlurState | null) => void;
}

const DiscussionBlurContext = createContext<DiscussionBlurContextValue>({
    blurState: null,
    setBlurState: () => {},
});

export function DiscussionBlurProvider({ children }: { children: ReactNode }) {
    const [blurState, setBlurState] = useState<DiscussionBlurState | null>(null);
    const value = useMemo(() => ({ blurState, setBlurState }), [blurState]);
    return (
        <DiscussionBlurContext.Provider value={value}>
            {children}
        </DiscussionBlurContext.Provider>
    );
}

export function useDiscussionBlurState() {
    return useContext(DiscussionBlurContext).blurState;
}

export function useSetDiscussionBlur() {
    return useContext(DiscussionBlurContext).setBlurState;
}
