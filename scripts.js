// File: scripts.js

// Show image
function showImage(imageId) {
    var img = document.getElementById(imageId);
    img.style.display = 'block'; // Show the image
}

// Show or hide image, depending on the current state
function toggleShowImage(imageId) {
    var img = document.getElementById(imageId);
    if (img.style.display === 'none' || img.style.display === '') {
        // Show the image
        img.style.display = 'block';
    } else {
        // Hide the image
        img.style.display = 'none';
    }
}

// Zoom or unzoom image, depending on the current state
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
