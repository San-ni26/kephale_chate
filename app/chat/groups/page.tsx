"use client";

import { useState } from "react";
import { Plus, UserPlus, MessageSquare } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";

export default function GroupsPage() {
    const [groups, setGroups] = useState([
        { id: "1", name: "Projet Alpha", members: 4 },
        { id: "2", name: "Sortie Week-end", members: 12 }
    ]);

    return (
        <div className="p-4 space-y-6">
            <div className="flex justify-between items-center px-2">
                <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">Groupes</h2>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button size="icon" className="rounded-full bg-blue-600 hover:bg-blue-700"><Plus /></Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
                        <DialogHeader>
                            <DialogTitle>Nouveau Groupe</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                            <Input placeholder="Nom du groupe" className="bg-slate-800 border-slate-700" />
                            <p className="text-xs text-slate-400">Ajoutez des participants directement depuis vos contacts après la création.</p>
                            <Button className="w-full bg-blue-600">Créer</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="space-y-2">
                {groups.map((group) => (
                    <div key={group.id} className="flex items-center p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:bg-slate-900 transition">
                        <Avatar className="h-10 w-10 border border-slate-700">
                            <AvatarFallback className="bg-blue-900 text-blue-200">{group.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="ml-4 flex-1">
                            <h3 className="font-semibold text-slate-100">{group.name}</h3>
                            <p className="text-xs text-slate-500">{group.members} membres</p>
                        </div>
                        <Button variant="ghost" size="icon" className="text-slate-400">
                            <MessageSquare className="w-5 h-5" />
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
}
