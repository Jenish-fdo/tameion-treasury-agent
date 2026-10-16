import { Shield, Users, Zap, Lock } from 'lucide-react';

const features = [
  {
    name: 'Decentralized Identity',
    description: 'Create and manage self-sovereign identities with full control over your data.',
    icon: Shield,
  },
  {
    name: 'Trust Layer',
    description: 'Build reputation through verifiable attestations and credentials.',
    icon: Users,
  },
  {
    name: 'AI Agent Support',
    description: 'Purpose-built identity system for autonomous AI agents.',
    icon: Zap,
  },
  {
    name: 'Privacy First',
    description: 'Zero-knowledge proofs for selective disclosure of credentials.',
    icon: Lock,
  },
];

export function Features() {
  return (
    <section className="border-t bg-gray-50 py-24">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold">Built for the Future</h2>
          <p className="text-lg text-gray-600">
            Everything you need to manage identity in Web3
          </p>
        </div>
        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div key={feature.name} className="card">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{feature.name}</h3>
              <p className="text-sm text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
