'use client';

import React, { useRef, useId, useEffect, memo } from 'react';

function mapRange(
    value: number,
    fromLow: number,
    fromHigh: number,
    toLow: number,
    toHigh: number
): number {
    if (fromLow === fromHigh) {
        return toLow;
    }
    const percentage = (value - fromLow) / (fromHigh - fromLow);
    return toLow + percentage * (toHigh - toLow);
}

const useInstanceId = (): string => {
    const id = useId();
    const cleanId = id.replace(/:/g, "");
    const instanceId = `ethereal-${cleanId}`;
    return instanceId;
};

interface EtherealBackgroundProps {
    color?: string;
    scale?: number;
    speed?: number;
    className?: string;
}

// Memoized to prevent unnecessary re-renders
export const EtherealBackground = memo(function EtherealBackground({
    color = 'rgba(214, 252, 81, 0.15)',
    scale = 60,
    speed = 40,
    className
}: EtherealBackgroundProps) {
    const id = useInstanceId();
    const feColorMatrixRef = useRef<SVGFEColorMatrixElement>(null);
    const animationRef = useRef<number | null>(null);
    const valueRef = useRef(0);

    const displacementScale = mapRange(scale, 1, 100, 20, 100);
    // Slower animation = better performance (higher number = slower)
    const animationSpeed = mapRange(speed, 1, 100, 0.5, 0.05);

    useEffect(() => {
        let lastTime = 0;
        const targetFPS = 30; // Throttle to 30fps instead of 60fps for performance
        const frameInterval = 1000 / targetFPS;

        const animate = (currentTime: number) => {
            animationRef.current = requestAnimationFrame(animate);

            const deltaTime = currentTime - lastTime;
            if (deltaTime < frameInterval) return;

            lastTime = currentTime - (deltaTime % frameInterval);

            valueRef.current = (valueRef.current + animationSpeed) % 360;

            if (feColorMatrixRef.current) {
                feColorMatrixRef.current.setAttribute("values", String(valueRef.current));
            }
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [animationSpeed]);

    return (
        <div
            className={className}
            style={{
                overflow: "hidden",
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                zIndex: 0,
                // Use contain to hint to browser about rendering optimization
                contain: "layout paint",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: -displacementScale,
                    filter: `url(#${id}) blur(4px)`,
                    // GPU acceleration
                    transform: "translateZ(0)",
                    willChange: "filter",
                }}
            >
                <svg style={{ position: "absolute", width: 0, height: 0 }}>
                    <defs>
                        <filter id={id}>
                            <feTurbulence
                                result="undulation"
                                numOctaves="2"
                                baseFrequency={`${mapRange(scale, 0, 100, 0.001, 0.0005)},${mapRange(scale, 0, 100, 0.004, 0.002)}`}
                                seed="0"
                                type="turbulence"
                            />
                            <feColorMatrix
                                ref={feColorMatrixRef}
                                in="undulation"
                                type="hueRotate"
                                values="180"
                            />
                            <feColorMatrix
                                in="dist"
                                result="circulation"
                                type="matrix"
                                values="4 0 0 0 1  4 0 0 0 1  4 0 0 0 1  1 0 0 0 0"
                            />
                            <feDisplacementMap
                                in="SourceGraphic"
                                in2="circulation"
                                scale={displacementScale}
                                result="dist"
                            />
                            <feDisplacementMap
                                in="dist"
                                in2="undulation"
                                scale={displacementScale}
                                result="output"
                            />
                        </filter>
                    </defs>
                </svg>
                <div
                    style={{
                        backgroundColor: color,
                        maskImage: `url('https://framerusercontent.com/images/ceBGguIpUU8luwByxuQz79t7To.png')`,
                        maskSize: "cover",
                        maskRepeat: "no-repeat",
                        maskPosition: "center",
                        width: "100%",
                        height: "100%",
                    }}
                />
            </div>
        </div>
    );
});
