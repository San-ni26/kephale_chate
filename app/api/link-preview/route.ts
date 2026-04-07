import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthenticatedRequest } from "@/src/middleware/auth";

interface LinkMetadata {
    title: string | null;
    description: string | null;
    image: string | null;
    url: string;
}

function extractMetaTag(html: string, property: string): string | null {
    // Try og:property first
    const ogRegex = new RegExp(`<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']+)["']`, 'i');
    const ogMatch = html.match(ogRegex);
    if (ogMatch) return ogMatch[1];
    
    // Try name=property
    const nameRegex = new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i');
    const nameMatch = html.match(nameRegex);
    if (nameMatch) return nameMatch[1];
    
    return null;
}

function extractTitle(html: string): string | null {
    const ogTitle = extractMetaTag(html, 'title');
    if (ogTitle) return ogTitle;
    
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : null;
}

function extractDescription(html: string): string | null {
    const ogDesc = extractMetaTag(html, 'description');
    if (ogDesc) return ogDesc;
    
    const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    return metaDesc ? metaDesc[1] : null;
}

function extractImage(html: string, baseUrl: string): string | null {
    const ogImage = extractMetaTag(html, 'image');
    if (!ogImage) return null;
    
    // Handle relative URLs
    if (ogImage.startsWith('http')) return ogImage;
    if (ogImage.startsWith('//')) return `https:${ogImage}`;
    
    const url = new URL(baseUrl);
    if (ogImage.startsWith('/')) return `${url.origin}${ogImage}`;
    return `${url.origin}/${ogImage}`;
}

export async function GET(request: NextRequest) {
    const authError = await authenticate(request);
    if (authError) return authError;
    
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    
    if (!url) {
        return NextResponse.json({ error: 'URL requise' }, { status: 400 });
    }
    
    // Validate URL
    let targetUrl: URL;
    try {
        targetUrl = new URL(url);
        if (!['http:', 'https:'].includes(targetUrl.protocol)) {
            return NextResponse.json({ error: 'URL invalide' }, { status: 400 });
        }
    } catch {
        return NextResponse.json({ error: 'URL invalide' }, { status: 400 });
    }
    
    try {
        // Fetch with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(targetUrl.toString(), {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        clearTimeout(timeout);
        
        if (!response.ok) {
            return NextResponse.json({ 
                title: targetUrl.hostname,
                description: null,
                image: null,
                url: url 
            } as LinkMetadata);
        }
        
        const html = await response.text();
        
        const metadata: LinkMetadata = {
            title: extractTitle(html),
            description: extractDescription(html),
            image: extractImage(html, url),
            url: url
        };
        
        return NextResponse.json(metadata);
        
    } catch (error) {
        // Return partial data on error
        return NextResponse.json({
            title: targetUrl.hostname,
            description: null,
            image: null,
            url: url
        } as LinkMetadata);
    }
}
