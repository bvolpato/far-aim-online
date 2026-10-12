import { useEffect, useState } from 'react';

interface Airplane {
  id: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  speed: number;
  delay: number;
  type: 'jet' | 'propeller' | 'contrail';
}

interface Confetti {
  id: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  color: string;
  delay: number;
}

// SVG airplane icons
const JetPlane = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
  </svg>
);

const PropellerPlane = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M22 10h-2V8l-8 2-1-5h-2l-1 5-8-2v2h2l1 3H2v2h1l-1 3h2v-2l8-2 1 5h2l1-5 8 2v-2h-2l1-3h1v-2h-1l1-3zM7 13l-1-3h3l-2 3zm10 0l-2-3h3l-1 3z"/>
  </svg>
);

export function AirplaneCelebration({ show }: { show: boolean }) {
  const [airplanes, setAirplanes] = useState<Airplane[]>([]);
  const [confetti, setConfetti] = useState<Confetti[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      
      // Generate airplanes
      const newAirplanes: Airplane[] = [];
      for (let i = 0; i < 8; i++) {
        newAirplanes.push({
          id: i,
          x: Math.random() * 100,
          y: Math.random() * 60 + 10,
          scale: Math.random() * 0.5 + 0.5,
          rotation: Math.random() * 30 - 15,
          speed: Math.random() * 3 + 2,
          delay: Math.random() * 2,
          type: Math.random() > 0.5 ? 'jet' : 'propeller',
        });
      }
      
      // Add contrails
      for (let i = 0; i < 3; i++) {
        newAirplanes.push({
          id: 100 + i,
          x: -20,
          y: Math.random() * 40 + 10,
          scale: 1,
          rotation: Math.random() * 10 - 5,
          speed: Math.random() * 2 + 3,
          delay: i * 0.5,
          type: 'contrail',
        });
      }
      
      setAirplanes(newAirplanes);

      // Generate confetti
      const colors = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899'];
      const newConfetti: Confetti[] = [];
      for (let i = 0; i < 50; i++) {
        newConfetti.push({
          id: i,
          x: Math.random() * 100,
          y: -10,
          rotation: Math.random() * 360,
          scale: Math.random() * 0.5 + 0.5,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: Math.random() * 3,
        });
      }
      setConfetti(newConfetti);

      // Clean up after animation
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 6000);

      return () => clearTimeout(timer);
    }
  }, [show]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {/* Sky gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-200/20 to-transparent animate-pulse" />
      
      {/* Airplanes */}
      {airplanes.map((airplane) => (
        <div
          key={airplane.id}
          className="absolute"
          style={{
            left: `${airplane.x}%`,
            top: `${airplane.y}%`,
            transform: `scale(${airplane.scale}) rotate(${airplane.rotation}deg)`,
            animation: airplane.type === 'contrail' 
              ? `flyAcross ${airplane.speed}s linear ${airplane.delay}s forwards`
              : `floatUp ${airplane.speed}s ease-out ${airplane.delay}s forwards`,
            opacity: 0,
          }}
        >
          {airplane.type === 'jet' && (
            <JetPlane className="w-12 h-12 text-foreground/70 drop-shadow-lg" />
          )}
          {airplane.type === 'propeller' && (
            <PropellerPlane className="w-10 h-10 text-emerald-600 dark:text-emerald-400 drop-shadow-lg" />
          )}
          {airplane.type === 'contrail' && (
            <div className="flex items-center">
              <JetPlane className="w-8 h-8 text-white drop-shadow-lg" />
              <div 
                className="h-1 bg-gradient-to-r from-white/80 to-transparent rounded-full"
                style={{ width: '100px', marginLeft: '-4px' }}
              />
            </div>
          )}
        </div>
      ))}

      {/* Confetti */}
      {confetti.map((piece) => (
        <div
          key={piece.id}
          className="absolute w-3 h-3"
          style={{
            left: `${piece.x}%`,
            top: `${piece.y}%`,
            backgroundColor: piece.color,
            transform: `scale(${piece.scale}) rotate(${piece.rotation}deg)`,
            animation: `confettiFall 4s ease-in ${piece.delay}s forwards`,
            opacity: 0,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      ))}

      {/* Celebration burst in center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative">
          {/* Radiating rings */}
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute w-32 h-32 -left-16 -top-16 rounded-full border-4 border-emerald-500/30"
              style={{
                animation: `ringExpand 1.5s ease-out ${i * 0.3}s forwards`,
                opacity: 0,
              }}
            />
          ))}
          
          {/* Center star burst */}
          <div 
            className="absolute w-4 h-4 -left-2 -top-2 bg-yellow-400 rounded-full"
            style={{
              animation: 'starBurst 0.5s ease-out forwards',
              boxShadow: '0 0 20px 10px rgba(250, 204, 21, 0.5)',
            }}
          />
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes floatUp {
          0% {
            opacity: 0;
            transform: translateY(50px) scale(var(--scale, 1)) rotate(var(--rotation, 0deg));
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(-200px) translateX(100px) scale(var(--scale, 1)) rotate(var(--rotation, 0deg));
          }
        }

        @keyframes flyAcross {
          0% {
            opacity: 0;
            transform: translateX(-100px);
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateX(calc(100vw + 100px));
          }
        }

        @keyframes confettiFall {
          0% {
            opacity: 0;
            transform: translateY(0) rotate(0deg);
          }
          10% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(100vh) rotate(720deg);
          }
        }

        @keyframes ringExpand {
          0% {
            opacity: 0.8;
            transform: scale(0);
          }
          100% {
            opacity: 0;
            transform: scale(4);
          }
        }

        @keyframes starBurst {
          0% {
            transform: scale(0);
            opacity: 1;
          }
          50% {
            transform: scale(3);
            opacity: 1;
          }
          100% {
            transform: scale(0);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
