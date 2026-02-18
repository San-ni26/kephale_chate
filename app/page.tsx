import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { ShieldCheck, Lock, Globe, Smartphone, Zap, MessageSquare, CheckCircle, Ticket, Building2, ListTodo, Users, Briefcase } from "lucide-react";

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">

            {/* Hero Section */}
            <header className="flex flex-col items-center justify-center pt-24 pb-16 px-6 text-center">
                <div className="bg-primary/10 p-3 rounded-full mb-6 ring-1 ring-primary/30">
                    <Lock className="w-12 h-12 text-primary" />
                </div>
                <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4 text-foreground">
                    Chat Professionnel <br />
                    <span className="text-muted-foreground">Confidentiel & Sécurisé</span>
                </h1>
                <p className="text-muted-foreground max-w-2xl text-lg md:text-xl mb-8">
                    Chiffrement de bout en bout. Vérification de localisation. Verrouillage d'appareil.
                    La solution ultime pour les organisations exigeantes.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <Link href="/register">
                        <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto text-lg h-12 px-8">
                            Commencer
                        </Button>
                    </Link>
                    <Link href="/login">
                        <Button size="lg" variant="outline" className="border-border hover:bg-muted w-full sm:w-auto text-lg h-12 px-8 text-foreground">
                            Connexion
                        </Button>
                    </Link>
                </div>
            </header>

            {/* Features Grid */}
            <section id="features" className="py-20 px-6 bg-muted/30">
                <div className="container mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">Fonctionnalités & Outils</h2>
                        <p className="text-muted-foreground max-w-xl mx-auto">
                            Une suite complète pour gérer votre organisation, vos événements et vos communications.
                        </p>
                    </div>

                    {/* Core Organization Features */}
                    <div className="mb-16">
                        <h3 className="text-xl font-semibold mb-8 text-center text-primary/80 uppercase tracking-wider">Gestion & Productivité</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <FeatureCard
                                icon={<Building2 className="w-8 h-8 text-foreground" />}
                                title="Organisations & Départements"
                                desc="Créez votre structure d'entreprise, gérez vos départements et vos équipes en toute simplicité."
                            />
                            <FeatureCard
                                icon={<ListTodo className="w-8 h-8 text-primary" />}
                                title="Gestion de Tâches"
                                desc="Assignez des tâches aux membres de votre département, suivez leur progression et validez leur accomplissement."
                            />
                            <FeatureCard
                                icon={<Users className="w-8 h-8 text-blue-500" />}
                                title="Collaboration d'Équipe"
                                desc="Espaces de discussion dédiés par département pour faciliter les échanges et le partage de fichiers."
                            />
                        </div>
                    </div>

                    {/* Event & Lifestyle Features */}
                    <div className="mb-16">
                        <h3 className="text-xl font-semibold mb-8 text-center text-primary/80 uppercase tracking-wider">Événements & Invitations</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8 max-w-4xl mx-auto">
                            <FeatureCard
                                icon={<Ticket className="w-8 h-8 text-pink-500" />}
                                title="Invitations Électroniques"
                                desc="Créez des cartes d'invitation digitales élégantes pour vos événements (mariages, fêtes). Gérez les RSVPs en temps réel."
                            />
                            <FeatureCard
                                icon={<Briefcase className="w-8 h-8 text-warning" />}
                                title="Événements Professionnels"
                                desc="Organisez des séminaires ou réunions, envoyez des pass d'accès sécurisés et gérez les listes de présence."
                            />
                        </div>
                    </div>

                    {/* Security Features */}
                    <div>
                        <h3 className="text-xl font-semibold mb-8 text-center text-primary/80 uppercase tracking-wider">Sécurité Avancée</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <FeatureCard
                                icon={<ShieldCheck className="w-8 h-8 text-slate-700 dark:text-slate-300" />}
                                title="Chiffrement E2E"
                                desc="Vos messages sont chiffrés de bout en bout. Confidentialité absolue garantie par cryptographie."
                            />
                            <FeatureCard
                                icon={<Globe className="w-8 h-8 text-cyan-500" />}
                                title="Sécurité Géographique"
                                desc="Contrôle d'accès basé sur la localisation. Définissez des zones autorisées pour vos membres."
                            />
                            <FeatureCard
                                icon={<Smartphone className="w-8 h-8 text-violet-500" />}
                                title="Verrouillage d'Appareil"
                                desc="Liaison forte entre le compte et l'appareil. Empêche l'accès non autorisé depuis un autre terminal."
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="mt-auto py-8 text-center text-muted-foreground border-t border-border">
                <p>&copy; 2026 Kephale Secure. Tous droits réservés.</p>
            </footer>
        </div>
    );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="bg-card border border-border p-6 rounded-2xl hover:bg-muted/50 transition duration-300">
            <div className="mb-4">{icon}</div>
            <h3 className="text-xl font-bold mb-2 text-foreground">{title}</h3>
            <p className="text-muted-foreground leading-relaxed">{desc}</p>
        </div>
    );
}
