import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { ShieldCheck, Lock, Globe, Smartphone } from "lucide-react";

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">

            {/* Hero Section */}
            <header className="flex flex-col items-center justify-center pt-24 pb-16 px-6 text-center">
                <div className="bg-blue-500/10 p-3 rounded-full mb-6 ring-1 ring-blue-500/30">
                    <Lock className="w-12 h-12 text-blue-400" />
                </div>
                <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4">
                    Chat Professionnel <br />
                    <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">Confidentiel & Sécurisé</span>
                </h1>
                <p className="text-slate-400 max-w-2xl text-lg md:text-xl mb-8">
                    Chiffrement de bout en bout. Vérification de localisation. Verrouillage d'appareil.
                    La solution ultime pour les organisations exigeantes.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <Link href="/register">
                        <Button size="lg" className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto text-lg h-12 px-8">
                            Commencer
                        </Button>
                    </Link>
                    <Link href="/login">
                        <Button size="lg" variant="outline" className="border-slate-700 hover:bg-slate-800 w-full sm:w-auto text-lg h-12 px-8 text-slate-200">
                            Connexion
                        </Button>
                    </Link>
                </div>
            </header>

            {/* Features Grid */}
            <section className="py-16 px-6 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
                <FeatureCard
                    icon={<ShieldCheck className="w-8 h-8 text-emerald-400" />}
                    title="Chiffrement E2E"
                    desc="Vos messages sont chiffrés sur votre appareil. Seuls vous et le destinataire possédez les clés."
                />
                <FeatureCard
                    icon={<Globe className="w-8 h-8 text-purple-400" />}
                    title="Sécurité Géographique"
                    desc="Vérification automatique de la localisation et contrôle d'accès par pays."
                />
                <FeatureCard
                    icon={<Smartphone className="w-8 h-8 text-orange-400" />}
                    title="Empreinte d'Appareil"
                    desc="Votre compte est lié à votre appareil unique. Tout changement nécessite une re-validation stricte."
                />
            </section>

            {/* Footer */}
            <footer className="mt-auto py-8 text-center text-slate-600 border-t border-slate-900">
                <p>&copy; 2024 Kephale Secure. Tous droits réservés.</p>
            </footer>
        </div>
    );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl hover:bg-slate-900 transition duration-300">
            <div className="mb-4">{icon}</div>
            <h3 className="text-xl font-bold mb-2 text-slate-200">{title}</h3>
            <p className="text-slate-400 leading-relaxed">{desc}</p>
        </div>
    );
}
