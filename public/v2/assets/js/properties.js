/**
 * Properties Page JavaScript - V2 Premium Dashboard
 */

let properties = [];
let currentPropertyId = null;

// Initialize properties page
document.addEventListener('DOMContentLoaded', async () => {
    await loadProperties();
});

/**
 * Load properties from backend
 */
async function loadProperties() {
    try {
        const response = await Utils.get(CONFIG.API.GET_PROPERTIES);

        if (!response.success) {
            throw new Error(response.error || 'Failed to load properties');
        }

        properties = response.properties || [];
        renderProperties();

        console.log('[Properties] Loaded', properties.length, 'properties');
    } catch (error) {
        console.error('[Properties] Failed to load:', error);
        Utils.showToast('Failed to load properties', 'error');
    }
}

/**
 * Render properties grid
 */
function renderProperties() {
    const grid = document.getElementById('propertiesGrid');
    const emptyState = document.getElementById('emptyState');

    if (!grid) return;

    if (properties.length === 0) {
        grid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';

    grid.innerHTML = properties.map(property => `
        <div class="property-card" data-property-id="${property.id}">
            <div class="property-image" style="background-image: url('${property.image || 'https://via.placeholder.com/400x200?text=No+Image'}');">
                <span class="property-badge">Active</span>
            </div>

            <div class="property-content">
                <h3>${property.name}</h3>

                <p class="property-address">
                    <i class="fas fa-map-marker-alt"></i>
                    ${property.address}
                </p>

                <div class="property-details">
                    <div class="property-detail">
                        <i class="fas fa-bed"></i>
                        ${property.bedrooms} bed
                    </div>
                    <div class="property-detail">
                        <i class="fas fa-bath"></i>
                        ${property.bathrooms} bath
                    </div>
                    <div class="property-detail">
                        <i class="fas fa-users"></i>
                        ${property.maxGuests} guests
                    </div>
                </div>

                <div class="property-actions">
                    <button class="btn-primary" style="flex: 1;"
                            onclick="editProperty('${property.id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn-secondary"
                            onclick="deleteProperty('${property.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Show add property modal
 */
function showAddPropertyModal() {
    currentPropertyId = null;

    // Reset form
    const form = document.getElementById('propertyForm');
    if (form) form.reset();

    // Update modal title
    const modalTitle = document.getElementById('propertyModalTitle');
    if (modalTitle) {
        modalTitle.innerHTML = '<i class="fas fa-building"></i> Add New Property';
    }

    // Show modal
    const modal = document.getElementById('propertyModal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
    }
}

/**
 * Edit property
 */
function editProperty(propertyId) {
    currentPropertyId = propertyId;
    const property = properties.find(p => p.id === propertyId);

    if (!property) {
        Utils.showToast('Property not found', 'error');
        return;
    }

    // Populate form
    document.getElementById('propertyId').value = property.id;
    document.getElementById('propertyName').value = property.name || '';
    document.getElementById('propertyAddress').value = property.address || '';
    document.getElementById('propertyType').value = property.type || '';
    document.getElementById('numberOfFloors').value = property.floors || '';
    document.getElementById('numberOfBedrooms').value = property.bedrooms || '';
    document.getElementById('numberOfBathrooms').value = property.bathrooms || '';
    document.getElementById('maxGuests').value = property.maxGuests || '';
    document.getElementById('squareFeet').value = property.squareFeet || '';

    // Listing platforms
    document.getElementById('airbnbListingUrl').value = property.airbnbUrl || '';
    document.getElementById('bookingComUrl').value = property.bookingComUrl || '';
    document.getElementById('vrboUrl').value = property.vrboUrl || '';

    // Access info
    document.getElementById('lockType').value = property.lockType || '';
    document.getElementById('doorCode').value = property.doorCode || '';
    document.getElementById('accessInstructions').value = property.accessInstructions || '';

    // Contacts
    document.getElementById('cleanerName').value = property.cleanerName || '';
    document.getElementById('cleanerPhone').value = property.cleanerPhone || '';
    document.getElementById('maintenanceName').value = property.maintenanceName || '';
    document.getElementById('maintenancePhone').value = property.maintenancePhone || '';
    document.getElementById('onGroundName').value = property.onGroundName || '';
    document.getElementById('onGroundPhone').value = property.onGroundPhone || '';

    // Amenities
    if (property.amenities) {
        Object.keys(property.amenities).forEach(amenity => {
            const checkbox = document.querySelector(`[name="amenity_${amenity}"]`);
            if (checkbox) {
                checkbox.checked = property.amenities[amenity];
            }
        });
    }

    // Notes
    document.getElementById('propertyNotes').value = property.notes || '';

    // Update modal title
    const modalTitle = document.getElementById('propertyModalTitle');
    if (modalTitle) {
        modalTitle.innerHTML = '<i class="fas fa-building"></i> Edit Property';
    }

    // Show modal
    const modal = document.getElementById('propertyModal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
    }
}

/**
 * Close property modal
 */
function closePropertyModal() {
    const modal = document.getElementById('propertyModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

/**
 * Handle property form submission
 */
async function handlePropertySubmit(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    // Gather amenities
    const amenities = {};
    const amenityCheckboxes = form.querySelectorAll('input[name^="amenity_"]');
    amenityCheckboxes.forEach(checkbox => {
        const amenityName = checkbox.name.replace('amenity_', '');
        amenities[amenityName] = checkbox.checked;
    });

    // Build property object
    const propertyData = {
        id: currentPropertyId || `prop_${Date.now()}`,
        name: formData.get('propertyName'),
        address: formData.get('propertyAddress'),
        type: formData.get('propertyType'),
        floors: parseInt(formData.get('numberOfFloors')) || 1,
        bedrooms: parseInt(formData.get('numberOfBedrooms')),
        bathrooms: parseFloat(formData.get('numberOfBathrooms')),
        maxGuests: parseInt(formData.get('maxGuests')),
        squareFeet: parseInt(formData.get('squareFeet')) || null,

        // Listing platforms
        airbnbUrl: formData.get('airbnbListingUrl'),
        bookingComUrl: formData.get('bookingComUrl'),
        vrboUrl: formData.get('vrboUrl'),

        // Access
        lockType: formData.get('lockType'),
        doorCode: formData.get('doorCode'),
        accessInstructions: formData.get('accessInstructions'),

        // Contacts
        cleanerName: formData.get('cleanerName'),
        cleanerPhone: formData.get('cleanerPhone'),
        maintenanceName: formData.get('maintenanceName'),
        maintenancePhone: formData.get('maintenancePhone'),
        onGroundName: formData.get('onGroundName'),
        onGroundPhone: formData.get('onGroundPhone'),

        // Amenities
        amenities: amenities,

        // Notes
        notes: formData.get('propertyNotes'),
    };

    try {
        // Save to backend
        const response = await Utils.post(CONFIG.API.SAVE_PROPERTY, propertyData);

        if (!response.success) {
            throw new Error(response.error || 'Failed to save property');
        }

        Utils.showToast(
            currentPropertyId ? 'Property updated!' : 'Property added!',
            'success'
        );

        // Close modal
        closePropertyModal();

        // Reload properties
        await loadProperties();

    } catch (error) {
        console.error('[Properties] Failed to save:', error);
        Utils.showToast('Failed to save property', 'error');
    }

    return false;
}

/**
 * Delete property
 */
async function deleteProperty(propertyId) {
    const property = properties.find(p => p.id === propertyId);

    if (!property || !confirm(`Are you sure you want to delete "${property.name}"?`)) {
        return;
    }

    try {
        const response = await Utils.delete(`${CONFIG.API.DELETE_PROPERTY}/${propertyId}`);

        if (!response.success) {
            throw new Error(response.error || 'Failed to delete property');
        }

        Utils.showToast('Property deleted', 'success');

        // Reload properties
        await loadProperties();

    } catch (error) {
        console.error('[Properties] Failed to delete:', error);
        Utils.showToast('Failed to delete property', 'error');
    }
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('propertyModal');
    if (e.target === modal) {
        closePropertyModal();
    }
});
