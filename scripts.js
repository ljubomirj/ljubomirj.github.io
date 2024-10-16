// File: scripts.js
function showImage() {
    var img = document.getElementById('zoomableImage');
    img.style.display = 'block'; // Show the image
}

function zoomImage(img) {
    // Check the current width to toggle between states
    if (img.style.width === '100%' || img.style.width === '') { 
        // Zoom in
        img.style.imageRendering = 'pixelated';
        img.style.width = 'auto';
        img.style.height = 'auto';
    } else {
        // Reset to original state
        img.style.imageRendering = 'auto'; 
        img.style.width = '100%';
        img.style.height = 'auto';
    }
}
