<#-- E-commerce Product Page Template -->

<#import "lib/ecommerce.ftl" as ecom/>
<#import "lib/currency.ftl" as currency/>
<#include "common/head.ftl"/>

<#-- Product data structure -->
<#assign product = {
  "id": 12345,
  "name": "Professional Wireless Headphones",
  "brand": "AudioTech Pro",
  "sku": "ATP-WH-001",
  "description": "Premium wireless headphones with active noise cancellation, 30-hour battery life, and superior sound quality.",
  "price": 299.99,
  "originalPrice": 399.99,
  "currency": "USD",
  "inStock": true,
  "stockQuantity": 15,
  "rating": 4.7,
  "reviewCount": 1284,
  "category": "Electronics > Audio > Headphones",
  "tags": ["wireless", "noise-cancelling", "premium", "bluetooth"],
  "images": [
    {"url": "/images/headphones-main.jpg", "alt": "Main product image", "type": "main"},
    {"url": "/images/headphones-side.jpg", "alt": "Side view", "type": "gallery"},
    {"url": "/images/headphones-case.jpg", "alt": "With carrying case", "type": "gallery"},
    {"url": "/images/headphones-colors.jpg", "alt": "Available colors", "type": "gallery"}
  ],
  "variants": [
    {"id": "black", "name": "Midnight Black", "price": 299.99, "inStock": true, "image": "/images/black.jpg"},
    {"id": "white", "name": "Pearl White", "price": 299.99, "inStock": true, "image": "/images/white.jpg"},
    {"id": "silver", "name": "Space Silver", "price": 319.99, "inStock": false, "image": "/images/silver.jpg"}
  ],
  "specifications": {
    "Driver Size": "40mm",
    "Frequency Response": "20Hz - 20kHz",
    "Battery Life": "30 hours",
    "Charging Time": "2 hours",
    "Weight": "250g",
    "Connectivity": "Bluetooth 5.0",
    "Noise Cancellation": "Active ANC",
    "Warranty": "2 years"
  },
  "features": [
    "Active Noise Cancellation technology",
    "30-hour battery life with quick charge",
    "Premium comfort with memory foam padding",
    "Bluetooth 5.0 with aptX HD support",
    "Voice assistant integration",
    "Foldable design with carrying case"
  ]
}/>

<#-- Related products -->
<#assign relatedProducts = [
  {"id": 12346, "name": "Wireless Earbuds Pro", "price": 149.99, "rating": 4.5, "image": "/images/earbuds.jpg"},
  {"id": 12347, "name": "Bluetooth Speaker", "price": 89.99, "rating": 4.3, "image": "/images/speaker.jpg"},
  {"id": 12348, "name": "Audio Cable Premium", "price": 29.99, "rating": 4.8, "image": "/images/cable.jpg"}
]/>

<#-- User context -->
<#assign user = user!{}>
<#assign isLoggedIn = user?has_content/>
<#assign cart = cart!{}>
<#assign wishlist = wishlist![]/>

<#-- Calculation functions -->
<#function calculateDiscount originalPrice currentPrice>
  <#return ((originalPrice - currentPrice) / originalPrice * 100)?round/>
</#function>

<#function formatPrice price currency="USD">
  <#switch currency>
    <#case "USD">
      <#return "$" + price?string(",##0.00")/>
    <#case "EUR">
      <#return "€" + price?string(",##0.00")/>
    <#case "GBP">
      <#return "£" + price?string(",##0.00")/>
    <#default>
      <#return price?string(",##0.00") + " " + currency/>
  </#switch>
</#function>

<#function generateStars rating maxRating=5>
  <#assign stars = ""/>
  <#list 1..maxRating as i>
    <#if i <= rating?floor>
      <#assign stars = stars + "★"/>
    <#elseif i <= rating + 0.5>
      <#assign stars = stars + "☆"/>
    <#else>
      <#assign stars = stars + "☆"/>
    </#if>
  </#list>
  <#return stars/>
</#function>

<#-- Product gallery macro -->
<#macro productGallery images>
  <div class="product-gallery">
    <div class="main-image">
      <img id="mainImage" src="${images[0].url}" alt="${images[0].alt}" class="main-product-image">
      <#if product.originalPrice > product.price>
        <div class="discount-badge">
          -${calculateDiscount(product.originalPrice, product.price)}%
        </div>
      </#if>
    </div>
    
    <div class="thumbnail-gallery">
      <#list images as image>
        <img src="${image.url}" alt="${image.alt}" class="thumbnail ${image_index == 0?string('active', '')}"
             onclick="changeMainImage('${image.url}', '${image.alt}')">
      </#list>
    </div>
  </div>
</#macro>

<#-- Product rating macro -->
<#macro productRating rating reviewCount>
  <div class="product-rating">
    <div class="stars" title="Rating: ${rating}/5">
      ${generateStars(rating)}
    </div>
    <span class="rating-number">${rating}</span>
    <span class="review-count">(${reviewCount} reviews)</span>
  </div>
</#macro>

<#-- Variant selector macro -->
<#macro variantSelector variants>
  <div class="variant-selector">
    <h4>Choose Color:</h4>
    <div class="variant-options">
      <#list variants as variant>
        <div class="variant-option ${variant.inStock?string('', 'out-of-stock')}" 
             data-variant-id="${variant.id}" 
             data-price="${variant.price}">
          <img src="${variant.image}" alt="${variant.name}" class="variant-image">
          <span class="variant-name">${variant.name}</span>
          <span class="variant-price">${formatPrice(variant.price)}</span>
          <#if !variant.inStock>
            <span class="out-of-stock-label">Out of Stock</span>
          </#if>
        </div>
      </#list>
    </div>
  </div>
</#macro>

<#-- Specifications table macro -->
<#macro specificationsTable specs>
  <div class="specifications">
    <h3>Specifications</h3>
    <table class="specs-table">
      <#list specs?keys as key>
        <tr>
          <td class="spec-name">${key}</td>
          <td class="spec-value">${specs[key]}</td>
        </tr>
      </#list>
    </table>
  </div>
</#macro>

<#-- Related products macro -->
<#macro relatedProductsSection products>
  <div class="related-products">
    <h3>You Might Also Like</h3>
    <div class="product-grid">
      <#list products as relatedProduct>
        <div class="product-card">
          <img src="${relatedProduct.image}" alt="${relatedProduct.name}" class="product-image">
          <h4 class="product-name">${relatedProduct.name}</h4>
          <@productRating rating=relatedProduct.rating reviewCount=0/>
          <div class="product-price">${formatPrice(relatedProduct.price)}</div>
          <button class="btn btn-outline">View Product</button>
        </div>
      </#list>
    </div>
  </div>
</#macro>

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${product.name} - ${product.brand} | AudioShop</title>
  <meta name="description" content="${product.description}">
  <meta name="keywords" content="${product.tags?join(', ')}">
  
  <#-- OpenGraph meta tags -->
  <meta property="og:title" content="${product.name}">
  <meta property="og:description" content="${product.description}">
  <meta property="og:image" content="${product.images[0].url}">
  <meta property="og:price:amount" content="${product.price}">
  <meta property="og:price:currency" content="${product.currency}">
  
  <#-- JSON-LD structured data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": "${product.name}",
    "brand": "${product.brand}",
    "description": "${product.description}",
    "sku": "${product.sku}",
    "image": [
      <#list product.images as image>
        "${image.url}"<#if image_has_next>,</#if>
      </#list>
    ],
    "offers": {
      "@type": "Offer",
      "price": "${product.price}",
      "priceCurrency": "${product.currency}",
      "availability": "${product.inStock?string('https://schema.org/InStock', 'https://schema.org/OutOfStock')}"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "${product.rating}",
      "reviewCount": "${product.reviewCount}"
    }
  }
  </script>
  
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .product-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
    .product-gallery { position: sticky; top: 20px; }
    .main-image { position: relative; margin-bottom: 20px; }
    .main-product-image { width: 100%; border-radius: 10px; }
    .discount-badge { position: absolute; top: 15px; right: 15px; background: #e74c3c; color: white; padding: 8px 12px; border-radius: 20px; font-weight: bold; }
    .thumbnail-gallery { display: flex; gap: 10px; overflow-x: auto; }
    .thumbnail { width: 80px; height: 80px; object-fit: cover; border-radius: 5px; cursor: pointer; border: 2px solid transparent; }
    .thumbnail.active, .thumbnail:hover { border-color: #007bff; }
    .product-info h1 { font-size: 2em; margin-bottom: 10px; }
    .product-brand { color: #666; font-size: 1.1em; margin-bottom: 15px; }
    .product-rating { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
    .stars { color: #ffc107; font-size: 1.2em; }
    .rating-number { font-weight: bold; }
    .review-count { color: #666; }
    .product-pricing { margin-bottom: 25px; }
    .current-price { font-size: 2em; font-weight: bold; color: #e74c3c; }
    .original-price { font-size: 1.2em; text-decoration: line-through; color: #999; margin-left: 10px; }
    .stock-status { margin-bottom: 20px; padding: 10px; border-radius: 5px; }
    .stock-status.in-stock { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .stock-status.out-of-stock { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .variant-selector { margin-bottom: 25px; }
    .variant-options { display: flex; gap: 15px; flex-wrap: wrap; }
    .variant-option { border: 2px solid #ddd; border-radius: 8px; padding: 10px; cursor: pointer; text-align: center; min-width: 120px; }
    .variant-option:hover { border-color: #007bff; }
    .variant-option.selected { border-color: #007bff; background: #f0f8ff; }
    .variant-option.out-of-stock { opacity: 0.5; cursor: not-allowed; }
    .variant-image { width: 50px; height: 50px; object-fit: cover; border-radius: 4px; margin-bottom: 5px; }
    .variant-name { display: block; font-weight: bold; font-size: 0.9em; }
    .variant-price { display: block; color: #666; font-size: 0.8em; }
    .out-of-stock-label { color: #e74c3c; font-size: 0.8em; }
    .quantity-selector { margin-bottom: 25px; }
    .quantity-controls { display: flex; align-items: center; gap: 10px; }
    .quantity-btn { background: #f8f9fa; border: 1px solid #ddd; padding: 8px 12px; cursor: pointer; }
    .quantity-input { width: 60px; text-align: center; padding: 8px; border: 1px solid #ddd; }
    .product-actions { display: flex; gap: 15px; margin-bottom: 30px; }
    .btn { padding: 15px 30px; border: none; border-radius: 5px; font-size: 1em; cursor: pointer; font-weight: bold; transition: all 0.3s; }
    .btn-primary { background: #007bff; color: white; }
    .btn-primary:hover { background: #0056b3; }
    .btn-outline { background: transparent; color: #007bff; border: 2px solid #007bff; }
    .btn-outline:hover { background: #007bff; color: white; }
    .btn-wishlist { background: #f8f9fa; color: #333; border: 1px solid #ddd; }
    .product-features { margin-bottom: 30px; }
    .features-list { list-style: none; }
    .features-list li { padding: 8px 0; border-bottom: 1px solid #eee; position: relative; padding-left: 25px; }
    .features-list li::before { content: "✓"; color: #28a745; font-weight: bold; position: absolute; left: 0; }
    .specs-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    .specs-table td { padding: 12px; border-bottom: 1px solid #eee; }
    .spec-name { font-weight: bold; width: 40%; background: #f8f9fa; }
    .product-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px; }
    .product-card { border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center; }
    .product-image { width: 100%; height: 150px; object-fit: cover; border-radius: 5px; margin-bottom: 10px; }
    @media (max-width: 768px) {
      .product-layout { grid-template-columns: 1fr; }
      .variant-options { justify-content: center; }
      .product-actions { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="container">
    <nav class="breadcrumb" style="margin-bottom: 20px; color: #666;">
      <a href="/">Home</a> > 
      <a href="/category/electronics">Electronics</a> > 
      <a href="/category/audio">Audio</a> > 
      <span>${product.name}</span>
    </nav>

    <div class="product-layout">
      <div class="product-gallery-section">
        <@productGallery images=product.images/>
      </div>

      <div class="product-info">
        <div class="product-brand">${product.brand}</div>
        <h1>${product.name}</h1>
        <div class="product-sku">SKU: ${product.sku}</div>
        
        <@productRating rating=product.rating reviewCount=product.reviewCount/>
        
        <div class="product-pricing">
          <span class="current-price">${formatPrice(product.price, product.currency)}</span>
          <#if product.originalPrice > product.price>
            <span class="original-price">${formatPrice(product.originalPrice, product.currency)}</span>
          </#if>
        </div>

        <div class="stock-status ${product.inStock?string('in-stock', 'out-of-stock')}">
          <#if product.inStock>
            ✓ In Stock (${product.stockQuantity} available)
          <#else>
            ✗ Out of Stock
          </#if>
        </div>

        <div class="product-description">
          <p>${product.description}</p>
        </div>

        <@variantSelector variants=product.variants/>

        <div class="quantity-selector">
          <h4>Quantity:</h4>
          <div class="quantity-controls">
            <button class="quantity-btn" onclick="changeQuantity(-1)">-</button>
            <input type="number" id="quantity" class="quantity-input" value="1" min="1" max="${product.stockQuantity}">
            <button class="quantity-btn" onclick="changeQuantity(1)">+</button>
          </div>
        </div>

        <div class="product-actions">
          <#if product.inStock>
            <button class="btn btn-primary" onclick="addToCart()">
              Add to Cart - ${formatPrice(product.price)}
            </button>
          <#else>
            <button class="btn btn-outline" disabled>Notify When Available</button>
          </#if>
          
          <button class="btn btn-wishlist" onclick="toggleWishlist()">
            <#if wishlist?seq_contains(product.id)>
              ♥ Remove from Wishlist
            <#else>
              ♡ Add to Wishlist
            </#if>
          </button>
        </div>

        <div class="product-features">
          <h3>Key Features</h3>
          <ul class="features-list">
            <#list product.features as feature>
              <li>${feature}</li>
            </#list>
          </ul>
        </div>

        <@specificationsTable specs=product.specifications/>
      </div>
    </div>

    <@relatedProductsSection products=relatedProducts/>

    <#-- Reviews section placeholder -->
    <div class="reviews-section" style="margin-top: 40px; padding: 20px; background: #f8f9fa; border-radius: 10px;">
      <h3>Customer Reviews (${product.reviewCount})</h3>
      <div class="review-summary">
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
          <span style="font-size: 3em; font-weight: bold;">${product.rating}</span>
          <div>
            <div class="stars" style="color: #ffc107; font-size: 1.5em;">${generateStars(product.rating)}</div>
            <div>Based on ${product.reviewCount} reviews</div>
          </div>
        </div>
      </div>
      
      <#-- Sample reviews -->
      <div class="review-item" style="border-top: 1px solid #ddd; padding: 15px 0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <strong>Sarah M.</strong>
          <div class="stars" style="color: #ffc107;">${generateStars(5)}</div>
        </div>
        <p>"Excellent sound quality and the noise cancellation is amazing. Perfect for travel!"</p>
        <small style="color: #666;">Verified Purchase - 2 weeks ago</small>
      </div>
    </div>
  </div>

  <script>
    function changeMainImage(src, alt) {
      document.getElementById('mainImage').src = src;
      document.getElementById('mainImage').alt = alt;
      
      // Update active thumbnail
      document.querySelectorAll('.thumbnail').forEach(thumb => thumb.classList.remove('active'));
      event.target.classList.add('active');
    }

    function changeQuantity(delta) {
      const input = document.getElementById('quantity');
      const newValue = parseInt(input.value) + delta;
      const max = parseInt(input.getAttribute('max'));
      
      if (newValue >= 1 && newValue <= max) {
        input.value = newValue;
      }
    }

    function addToCart() {
      const quantity = document.getElementById('quantity').value;
      const selectedVariant = document.querySelector('.variant-option.selected');
      
      alert(`Added ${quantity} item(s) to cart!`);
      // In real implementation, this would make an AJAX call
    }

    function toggleWishlist() {
      // Toggle wishlist functionality
      alert('Wishlist functionality would be implemented here');
    }

    // Variant selection
    document.querySelectorAll('.variant-option').forEach(option => {
      option.addEventListener('click', function() {
        if (!this.classList.contains('out-of-stock')) {
          document.querySelectorAll('.variant-option').forEach(opt => opt.classList.remove('selected'));
          this.classList.add('selected');
          
          // Update price based on selected variant
          const price = this.getAttribute('data-price');
          document.querySelector('.current-price').textContent = '$' + parseFloat(price).toFixed(2);
        }
      });
    });

    // Auto-select first available variant
    document.addEventListener('DOMContentLoaded', function() {
      const firstAvailable = document.querySelector('.variant-option:not(.out-of-stock)');
      if (firstAvailable) {
        firstAvailable.classList.add('selected');
      }
    });
  </script>
</body>
</html>