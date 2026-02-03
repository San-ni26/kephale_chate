import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { ShieldCheck, Lock, Globe, Smartphone } from "lucide-react";

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
            <section className="py-16 px-6 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
                <FeatureCard
                    icon={<ShieldCheck className="w-8 h-8 text-foreground" />}
                    title="Chiffrement E2E"
                    desc="Vos messages sont chiffrés sur votre appareil. Seuls vous et le destinataire possédez les clés."
                />
                <FeatureCard
                    icon={<Globe className="w-8 h-8 text-foreground" />}
                    title="Sécurité Géographique"
                    desc="Vérification automatique de la localisation et contrôle d'accès par pays."
                />
                <FeatureCard
                    icon={<Smartphone className="w-8 h-8 text-foreground" />}
                    title="Empreinte d'Appareil"
                    desc="Votre compte est lié à votre appareil unique. Tout changement nécessite une re-validation stricte."
                />
            </section>

            {/* Footer */}
            <footer className="mt-auto py-8 text-center text-muted-foreground border-t border-border">
                <p>&copy; 2024 Kephale Secure. Tous droits réservés.</p>
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
