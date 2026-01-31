# this script downloads and installs go.

# Download the latest version (check https://go.dev/dl/ for current version)
wget https://go.dev/dl/go1.25.6.linux-amd64.tar.gz

# Remove any previous Go installation and extract
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.25.6.linux-amd64.tar.gz

# Add Go to your PATH
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

# Verify installation
go version