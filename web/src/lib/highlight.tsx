import React from 'react';

export function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightMatch(text: string, query: string): React.ReactNode {
    if (!query || !text) return text;

    const words = query.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return text;

    const pattern = words.map(escapeRegExp).join('|');
    const regex = new RegExp(`(${pattern})`, 'gi');

    const parts = text.split(regex);

    return (
        <>
            {parts.map((part, index) => {
                const isMatch = words.some(w => part.toLowerCase() === w.toLowerCase());
                return isMatch ? (
                    <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 text-inherit rounded px-0.5">
                        {part}
                    </mark>
                ) : (
                    part
                );
            })}
        </>
    );
}
