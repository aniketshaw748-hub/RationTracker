import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Rect, ClipPath, Defs, G } from 'react-native-svg';
import { useTheme } from './ThemeContext';

interface ContainerVisualizerProps {
  shape: 'jar' | 'bag' | 'bottle';
  color: string;
  fillPercentage: number; // 0 to 100
  size?: number;
}

export const ContainerVisualizer: React.FC<ContainerVisualizerProps> = ({
  shape,
  color,
  fillPercentage,
  size = 120,
}) => {
  const { colors, isDark } = useTheme();
  
  // Ensure fillPercentage is between 0 and 100
  const fill = Math.min(100, Math.max(0, fillPercentage));
  const glassColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
  const strokeColor = isDark ? '#475569' : '#CBD5E1'; // Slate 600 or Slate 300
  const lidColor = isDark ? '#94A3B8' : '#64748B'; // Slate 400 or Slate 500

  // The visual height of the contents inside the SVG viewport (usually height is 100)
  // We leave some margin at the top for the lid / neck.
  // Viewport: 0 0 100 120
  
  const getContainerPaths = () => {
    switch (shape) {
      case 'bottle':
        return {
          // Inside area for clipping content
          clipPath: `
            M 42,15 
            L 58,15 
            L 58,40 
            Q 58,50 78,55 
            L 78,110 
            Q 78,115 73,115 
            L 27,115 
            Q 22,115 22,110 
            L 22,55 
            Q 42,50 42,40 
            Z
          `,
          // Outline path
          outline: `
            M 40,20 
            L 60,20 
            L 60,40 
            Q 60,48 78,53 
            L 78,112 
            A 6,6 0 0 1 72,118 
            L 28,118 
            A 6,6 0 0 1 22,112 
            L 22,53 
            Q 40,48 40,40 
            Z
          `,
          // Lid/Cap paths
          lid: () => (
            <Rect x={36} y={8} width={28} height={12} rx={3} fill={lidColor} />
          ),
          // Fill baseline limits:
          // Min Y (100% full) is around 45 (below neck)
          // Max Y (0% full) is 115 (bottom)
          minY: 45,
          maxY: 115,
        };
      case 'bag':
        return {
          // Inside area for clipping content
          clipPath: `
            M 30,22
            L 70,22
            Q 68,35 76,45
            L 80,108
            Q 80,115 72,115
            L 28,115
            Q 20,115 20,108
            L 24,45
            Q 32,35 30,22
            Z
          `,
          // Outline path
          outline: `
            M 30,22
            L 70,22
            Q 68,35 76,45
            L 80,110
            A 6,6 0 0 1 74,116
            L 26,116
            A 6,6 0 0 1 20,110
            L 24,45
            Q 32,35 30,22
            Z
          `,
          // Lid/Cap paths (Bag seal / Clip)
          lid: () => (
            <G>
              <Rect x={25} y={15} width={50} height={7} rx={2} fill={lidColor} />
              {/* Bag crimp lines */}
              <Path d="M 28,15 L 28,22 M 38,15 L 38,22 M 48,15 L 48,22 M 58,15 L 58,22 M 68,15 L 68,22" stroke={isDark ? '#475569' : '#CBD5E1'} strokeWidth={1} />
            </G>
          ),
          // Fill baseline limits:
          // Min Y (100% full) is 25
          // Max Y (0% full) is 115
          minY: 25,
          maxY: 115,
        };
      case 'jar':
      default:
        return {
          // Inside area for clipping content
          clipPath: `
            M 24,25
            L 76,25
            Q 82,25 82,31
            L 82,108
            Q 82,115 76,115
            L 24,115
            Q 18,115 18,108
            L 18,31
            Q 18,25 24,25
            Z
          `,
          // Outline path
          outline: `
            M 24,25
            L 76,25
            Q 82,25 82,31
            L 82,110
            A 6,6 0 0 1 76,116
            L 24,116
            A 6,6 0 0 1 18,110
            L 18,31
            Q 18,25 24,25
            Z
          `,
          // Lid/Cap paths
          lid: () => (
            <Rect x={22} y={13} width={56} height={12} rx={4} fill={lidColor} />
          ),
          // Fill baseline limits:
          // Min Y (100% full) is 28
          // Max Y (0% full) is 115
          minY: 28,
          maxY: 115,
        };
    }
  };

  const paths = getContainerPaths();
  const fillHeight = ((paths.maxY - paths.minY) * fill) / 100;
  const fillY = paths.maxY - fillHeight;

  return (
    <View style={{ width: size, height: size * 1.2, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 120">
        <Defs>
          <ClipPath id={`clip-${shape}`}>
            <Path d={paths.clipPath} />
          </ClipPath>
        </Defs>

        {/* Container background (empty glass look) */}
        <Path d={paths.clipPath} fill={glassColor} />

        {/* Clipped liquid/powder content */}
        <G clipPath={`url(#clip-${shape})`}>
          <Rect
            x={0}
            y={fillY}
            width={100}
            height={fillHeight}
            fill={color}
            opacity={0.85}
          />
          {/* Wave/Liquid detail at top of fill */}
          {fill > 0 && fill < 100 && (
            <Path
              d={`M 0,${fillY} Q 25,${fillY - 3} 50,${fillY} T 100,${fillY} L 100,${fillY + 6} L 0,${fillY + 6} Z`}
              fill={color}
              opacity={0.5}
            />
          )}
        </G>

        {/* Container Outline */}
        <Path
          d={paths.outline}
          fill="none"
          stroke={strokeColor}
          strokeWidth={3}
          strokeLinejoin="round"
        />

        {/* Glass reflection / shine lines */}
        <Path
          d="M 28,45 Q 26,70 28,95"
          fill="none"
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Lid/Cap */}
        {paths.lid()}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({});
