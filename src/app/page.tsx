import { Navbar } from '@/components/marketing/navbar';
import { Hero } from '@/components/marketing/hero';
import { TrustBar } from '@/components/marketing/trust-bar';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { AiEvaluation } from '@/components/marketing/ai-evaluation';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { Security } from '@/components/marketing/security';
import { Faq } from '@/components/marketing/faq';
import { FinalCta, Footer } from '@/components/marketing/cta-footer';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <TrustBar />
        <HowItWorks />
        <AiEvaluation />
        <FeatureGrid />
        <Security />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
