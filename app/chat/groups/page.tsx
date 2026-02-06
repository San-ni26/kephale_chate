"use client";

import { useState } from "react";
import { Plus, UserPlus, MessageSquare } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";

import useSWR from "swr";
import { fetcher } from "@/src/lib/fetcher";

export default function GroupsPage() {
    const { data: groupsData } = useSWR('/api/groups', fetcher);
    const groups = groupsData?.groups || [];


    return (
        <div className="p-4 space-y-6">
            <div className="flex justify-between items-center px-2">
                <h2 className="text-xl font-bold text-foreground">Groupes</h2>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button size="icon" className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground"><Plus /></Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border text-foreground">
                        <DialogHeader>
                            <DialogTitle>Nouveau Groupe</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                            <Input placeholder="Nom du groupe" className="bg-muted border-border" />
                            <p className="text-xs text-muted-foreground">Ajoutez des participants directement depuis vos contacts après la création.</p>
                            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Créer</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="space-y-2">
                {groups.map((group: any) => (
                    <div key={group.id} className="flex items-center p-4 bg-muted/50 border border-border rounded-xl hover:bg-muted transition">
                        <Avatar className="h-10 w-10 border border-border">
                            <AvatarFallback className="bg-secondary text-secondary-foreground">{group.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="ml-4 flex-1">
                            <h3 className="font-semibold text-foreground">{group.name}</h3>
                            <p className="text-xs text-muted-foreground">{group._count?.members || 0} membres</p>
                        </div>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                            <MessageSquare className="w-5 h-5" />
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
}
