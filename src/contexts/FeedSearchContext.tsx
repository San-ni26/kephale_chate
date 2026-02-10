"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type FeedSearchContextValue = {
    searchQ: string;
    setSearchQ: (q: string) => void;
    searchOpen: boolean;
    setSearchOpen: (open: boolean) => void;
    closeSearch: () => void;
};

const defaultValue: FeedSearchContextValue = {
    searchQ: "",
    setSearchQ: () => {},
    searchOpen: false,
    setSearchOpen: () => {},
    closeSearch: () => {}
};

const FeedSearchContext = createContext<FeedSearchContextValue>(defaultValue);

export function FeedSearchProvider({ children }: { children: ReactNode }) {
    const [searchQ, setSearchQ] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const closeSearch = useCallback(() => {
        setSearchOpen(false);
        setSearchQ("");
    }, []);

    return (
        <FeedSearchContext.Provider
            value={{
                searchQ,
                setSearchQ,
                searchOpen,
                setSearchOpen,
                closeSearch
            }}
        >
            {children}
        </FeedSearchContext.Provider>
    );
}

export function useFeedSearch() {
    return useContext(FeedSearchContext);
}
