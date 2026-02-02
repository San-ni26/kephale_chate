"use client";

import { Bell } from "lucide-react";

export default function NotificationsPage() {
    const notifs = [
        { id: 1, text: "Bienvenue sur Chat Confidentiel !", date: "29 Jan" },
        { id: 2, text: "Mise à jour de sécurité disponible.", date: "28 Jan" }
    ];

    return (
        <div className="p-4 space-y-4">
            <h2 className="text-xl font-bold px-2">Notifications</h2>
            {notifs.map((n) => (
                <div key={n.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-start">
                    <Bell className="text-blue-500 w-5 h-5 mt-1 mr-3 shrink-0" />
                    <div>
                        <p className="text-slate-200 text-sm">{n.text}</p>
                        <span className="text-xs text-slate-500 block mt-1">{n.date}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
