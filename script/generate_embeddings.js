import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// Resolve .env from the ve-api root (one level up from this script)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

// Load environment variables if using dotenv, or replace with your credentials/env vars
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://klixyrdhwlloswsspmqk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
    console.error("Error: Supabase key is missing. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const OLLAMA_EMBED_URL = 'http://localhost:11434/api/embed';

async function generateEmbedding(text) {
    try {
        const response = await fetch(OLLAMA_EMBED_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'nomic-embed-text',
                input: text
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.embeddings[0];
    } catch (error) {
        console.error("Failed to generate embedding for text:", text.substring(0, 50), error);
        return null;
    }
}

async function processCatalog() {
    console.log("Fetching products from Supabase...");
    const { data: products, error } = await supabase.from('products').select('*');

    if (error) {
        console.error("Error fetching products:", error);
        return;
    }

    console.log(`Found ${products.length} products. Processing knowledge chunks...`);

    // Clear existing knowledge base to prevent duplicates on re-runs
    const { error: deleteError } = await supabase.from('product_knowledge').delete().neq('id', 0);
    if (deleteError) {
        console.warn("Warning clearing old knowledge chunks:", deleteError.message);
    }

    for (const product of products) {
        const chunks = [];

        // 1. Overview / Description Chunk
        if (product.name || product.description) {
            chunks.push({
                type: 'overview',
                content: `Product Name: ${product.name}\nBrand: ${product.brand || 'Van Elvina'}\nCategory: ${product.category} > ${product.subcategory || ''}\nPrice: ₹${product.price} (Original: ₹${product.original_price}, Discount: ${product.discount || '0%'}%)\nDescription: ${product.description}\nHighlights: ${JSON.stringify(product.highlights || [])}`
            });
        }

        // 2. Fabric & Care Chunk
        if (product.fabric || product.care) {
            chunks.push({
                type: 'fabric_care',
                content: `Product: ${product.name}\nFabric: ${product.fabric}\nCare Instructions: ${product.care}\nFeatures: ${JSON.stringify(product.features || [])}`
            });
        }

        // 3. FAQs Chunk
        if (Array.isArray(product.faqs) && product.faqs.length > 0) {
            product.faqs.forEach((faq, idx) => {
                chunks.push({
                    type: 'faq',
                    content: `Product: ${product.name}\nFAQ Q${idx + 1}: ${faq.question || faq.q}\nFAQ A${idx + 1}: ${faq.answer || faq.a}`
                });
            });
        }

        // Embed and insert each chunk
        for (const chunk of chunks) {
            console.log(`Generating embedding for [${product.name}] - type: ${chunk.type}...`);
            const embedding = await generateEmbedding(chunk.content);

            if (embedding) {
                const { error: insertError } = await supabase.from('product_knowledge').insert({
                    product_id: product.id,
                    chunk_type: chunk.type,
                    content: chunk.content,
                    metadata: { slug: product.slug, name: product.name, category: product.category },
                    embedding: embedding
                });

                if (insertError) {
                    console.error(`Error inserting chunk for product ${product.id}:`, insertError);
                }
            }
        }
    }

    console.log("Finished generating and storing product knowledge embeddings!");
}

processCatalog();