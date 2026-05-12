import React from 'react';

const BELT = {
  white:  '#E0E0E0',
  blue:   '#1565C0',
  purple: '#7B1FA2',
  brown:  '#795548',
  black:  '#212121',
};

export default function BeltBar({ color = 'white', stripes = 0, width = 120, height = 18 }) {
  const bc = BELT[color] || BELT.white;
  return (
    <div
      style={{
        width, height,
        borderRadius: height / 3,
        background: bc,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: `0 2px 8px ${bc}30`,
      }}
    >
      {/* 검은 띠 (그립 영역) */}
      <div
        style={{
          position: 'absolute',
          right: width * 0.15,
          top: 0, bottom: 0,
          width: height * 0.35,
          background: '#111',
        }}
      />
      {/* 줄 (stripes) */}
      {Array.from({ length: stripes }).map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            right: width * 0.15 + height * 0.45 + i * (height * 0.18 + 2),
            top: '15%', bottom: '15%',
            width: height * 0.12,
            background: '#fff',
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}
